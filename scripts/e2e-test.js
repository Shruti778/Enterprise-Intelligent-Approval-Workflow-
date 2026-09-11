/* eslint-disable no-console */
/**
 * End-to-end verification of the approval platform against a running backend.
 * Usage: node scripts/e2e-test.js  (defaults to http://localhost:4000/api)
 */
const API = process.env.API_URL || 'http://localhost:4000/api';
const PASSWORD = 'password123';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` (${detail})` : ''}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function login(email) {
  const res = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  if (!res.success) throw new Error(`login failed for ${email}: ${JSON.stringify(res)}`);
  return { token: res.data.token, user: res.data.user };
}

/** Finds the PENDING step addressed to a given role on a request. */
async function pendingStepFor(token, requestId, role) {
  const res = await api('/approvals/pending', { token });
  const match = (res.data || []).find(
    (item) => item.request && item.request.id === requestId && item.approverRole === role
  );
  return match ? match.stepId : null;
}

async function main() {
  console.log(`\n=== Approval Workflow Platform - end-to-end test ===\nAPI: ${API}\n`);

  /* -------------------------------- 1. auth ------------------------------- */
  console.log('1. Authentication');
  const employee = await login('employee@company.com');
  const manager = await login('manager@company.com');
  const finance = await login('finance@company.com');
  const compliance = await login('compliance@company.com');
  const director = await login('director@company.com');
  const it = await login('it@company.com');

  check('employee logs in and receives a JWT', Boolean(employee.token));
  check('profile carries id/name/email/role/department',
    Boolean(employee.user.id && employee.user.name && employee.user.email &&
            employee.user.role && employee.user.department),
    `${employee.user.role} / ${employee.user.department}`);

  const badLogin = await api('/auth/login', {
    method: 'POST',
    body: { email: 'employee@company.com', password: 'nope' },
  });
  check('wrong password is rejected with 401', badLogin.status === 401);

  const noToken = await api('/requests');
  check('protected route without a token returns 401', noToken.status === 401);

  /* ------------------ 2. high-value laptop, full chain -------------------- */
  console.log('\n2. High-value laptop request -> HIGH risk -> 4-stage workflow');
  const created = await api('/requests', {
    method: 'POST',
    token: employee.token,
    body: {
      type: 'LAPTOP',
      title: 'E2E - MacBook Pro M3 Max',
      description: 'End-to-end test request',
      amount: 150000,
      metadata: {
        specification: 'MacBook Pro',
        purpose: 'Development',
        urgency: 'HIGH',
        newVendor: true,
      },
    },
  });
  check('request created', created.status === 201, created.data && created.data.requestNumber);
  check('new request starts as DRAFT', created.data.status === 'DRAFT');
  const requestId = created.data.id;

  const submitted = await api(`/requests/${requestId}/submit`, { method: 'POST', token: employee.token });
  check('submit succeeds', submitted.status === 200);
  check('risk level is HIGH', submitted.data.risk.level === 'HIGH', `score ${submitted.data.risk.score}`);
  check('risk factors are explainable', submitted.data.risk.factors.length >= 3,
    submitted.data.risk.factors.map((f) => f.factor).join(', '));
  check('request moves to IN_REVIEW', submitted.data.status === 'IN_REVIEW');

  const detail = await api(`/requests/${requestId}`, { token: employee.token });
  const path = detail.data.workflow.steps.map((s) => s.approverRole).join(' -> ');
  check('workflow is MANAGER -> FINANCE -> COMPLIANCE -> DIRECTOR',
    path === 'MANAGER -> FINANCE -> COMPLIANCE -> DIRECTOR', path);
  check('only the first step is PENDING',
    detail.data.workflow.steps.filter((s) => s.status === 'PENDING').length === 1);

  /* ------------------------- 3. authorization ----------------------------- */
  console.log('\n3. Authorization is enforced by the backend');
  const managerStep = await pendingStepFor(manager.token, requestId, 'MANAGER');
  check('manager sees the request in their pending queue', Boolean(managerStep));

  const wrongRole = await api(`/approvals/${managerStep}/approve`, { method: 'POST', token: finance.token, body: {} });
  check('FINANCE cannot approve a MANAGER step', wrongRole.status === 403, wrongRole.error && wrongRole.error.message);

  const asEmployee = await api(`/approvals/${managerStep}/approve`, { method: 'POST', token: employee.token, body: {} });
  check('EMPLOYEE cannot reach the approval endpoint at all', asEmployee.status === 403);

  const itQueue = await api('/approvals/pending', { token: it.token });
  check('IT does not see a step that is not addressed to them',
    !(itQueue.data || []).some((i) => i.request && i.request.id === requestId));

  /* --------------------------- 4. approvals ------------------------------- */
  console.log('\n4. Sequential approval chain');
  const a1 = await api(`/approvals/${managerStep}/approve`, {
    method: 'POST', token: manager.token, body: { comment: 'Approved by manager' },
  });
  check('manager approves', a1.status === 200);
  check('request still IN_REVIEW after step 1', a1.data.status === 'IN_REVIEW');
  check('finance step is now PENDING',
    a1.data.workflow.steps.find((s) => s.approverRole === 'FINANCE').status === 'PENDING');

  const financeStep = await pendingStepFor(finance.token, requestId, 'FINANCE');
  const a2 = await api(`/approvals/${financeStep}/approve`, {
    method: 'POST', token: finance.token, body: { comment: 'Budget confirmed' },
  });
  check('finance approves', a2.status === 200);

  const reApprove = await api(`/approvals/${financeStep}/approve`, {
    method: 'POST', token: finance.token, body: {},
  });
  check('an already-approved step cannot be approved twice', reApprove.status === 409);

  const complianceStep = await pendingStepFor(compliance.token, requestId, 'COMPLIANCE');
  const a3 = await api(`/approvals/${complianceStep}/approve`, {
    method: 'POST', token: compliance.token, body: { comment: 'Vendor due diligence done' },
  });
  check('compliance approves', a3.status === 200);
  check('director step becomes PENDING only now',
    a3.data.workflow.steps.find((s) => s.approverRole === 'DIRECTOR').status === 'PENDING');

  const directorStep = await pendingStepFor(director.token, requestId, 'DIRECTOR');
  const a4 = await api(`/approvals/${directorStep}/approve`, {
    method: 'POST', token: director.token, body: { comment: 'Signed off' },
  });
  check('director approves', a4.status === 200);
  check('REQUEST IS APPROVED after the final step', a4.data.status === 'APPROVED');
  check('workflow instance is APPROVED', a4.data.workflow.status === 'APPROVED');
  check('every step is APPROVED', a4.data.workflow.steps.every((s) => s.status === 'APPROVED'));

  /* ---------------------- 5. approval history kept ------------------------ */
  console.log('\n5. Approval history and audit trail');
  const actions = a4.data.workflow.steps.flatMap((s) => s.actions);
  check('one approval_action per approval', actions.length === 4, `${actions.length} actions`);
  check('comments are preserved', actions.every((a) => a.comment && a.actor && a.actor.name));

  const audit = await api(`/requests/${requestId}/audit`, { token: employee.token });
  const auditActions = (audit.data || []).map((a) => a.action);
  ['REQUEST_CREATED', 'RISK_CALCULATED', 'WORKFLOW_CREATED', 'REQUEST_SUBMITTED', 'REQUEST_APPROVED']
    .forEach((action) => check(`audit log contains ${action}`, auditActions.includes(action)));

  /* ------------------------ 6. short workflow ----------------------------- */
  console.log('\n6. Low-risk request produces a shorter workflow');
  const lowRisk = await api('/requests', {
    method: 'POST',
    token: employee.token,
    body: {
      type: 'LAPTOP',
      title: 'E2E - Standard laptop',
      amount: 30000,
      metadata: { specification: 'Dell Latitude', purpose: 'Development', urgency: 'LOW', newVendor: false },
    },
  });
  const lowSubmitted = await api(`/requests/${lowRisk.data.id}/submit`, { method: 'POST', token: employee.token });
  const lowPath = lowSubmitted.data.workflow
    ? lowSubmitted.data.workflow.steps.map((s) => s.approverRole).join(' -> ')
    : (await api(`/requests/${lowRisk.data.id}`, { token: employee.token })).data.workflow.steps
        .map((s) => s.approverRole).join(' -> ');
  check('risk level is LOW', lowSubmitted.data.risk.level === 'LOW', `score ${lowSubmitted.data.risk.score}`);
  check('workflow is MANAGER -> IT', lowPath === 'MANAGER -> IT', lowPath);

  const lowManagerStep = await pendingStepFor(manager.token, lowRisk.data.id, 'MANAGER');
  await api(`/approvals/${lowManagerStep}/approve`, { method: 'POST', token: manager.token, body: { comment: 'ok' } });
  const lowItStep = await pendingStepFor(it.token, lowRisk.data.id, 'IT');
  const lowFinal = await api(`/approvals/${lowItStep}/approve`, {
    method: 'POST', token: it.token, body: { comment: 'Stock available' },
  });
  check('two approvals complete the short workflow', lowFinal.data.status === 'APPROVED');

  /* --------------------------- 7. rejection ------------------------------- */
  console.log('\n7. Rejection path');
  const toReject = await api('/requests', {
    method: 'POST',
    token: employee.token,
    body: {
      type: 'EXPENSE',
      title: 'E2E - Expense to reject',
      amount: 9000,
      metadata: { category: 'MEALS', receiptProvided: true, expenseDate: '2026-09-01' },
    },
  });
  await api(`/requests/${toReject.data.id}/submit`, { method: 'POST', token: employee.token });
  const rejectStep = await pendingStepFor(manager.token, toReject.data.id, 'MANAGER');

  const noComment = await api(`/approvals/${rejectStep}/reject`, { method: 'POST', token: manager.token, body: {} });
  check('rejection without a comment is refused', noComment.status === 400);

  const rejected = await api(`/approvals/${rejectStep}/reject`, {
    method: 'POST', token: manager.token, body: { comment: 'Not a valid business expense' },
  });
  check('rejection succeeds with a comment', rejected.status === 200);
  check('request is REJECTED', rejected.data.status === 'REJECTED');
  check('workflow is REJECTED', rejected.data.workflow.status === 'REJECTED');
  check('downstream steps are SKIPPED',
    rejected.data.workflow.steps.filter((s) => s.status === 'SKIPPED').length >= 1);
  check('rejection comment is stored',
    rejected.data.workflow.steps.some((s) => s.actions.some((a) => a.action === 'REJECTED' && a.comment)));

  /* -------------------------- 8. resubmission ----------------------------- */
  console.log('\n8. Resubmission of a rejected request');
  const resubmitted = await api(`/requests/${toReject.data.id}/resubmit`, {
    method: 'POST', token: employee.token,
  });
  check('rejected request can be resubmitted', resubmitted.status === 200);
  check('resubmitted request is IN_REVIEW again', resubmitted.data.status === 'IN_REVIEW');
  check('a fresh workflow instance is running', resubmitted.data.workflow.status === 'IN_PROGRESS');

  /* ------------------------ 9. parallel approval -------------------------- */
  console.log('\n9. Parallel approval stage (Finance + Compliance)');
  const travel = await api('/requests', {
    method: 'POST',
    token: employee.token,
    body: {
      type: 'TRAVEL',
      title: 'E2E - International travel',
      amount: 200000,
      metadata: {
        destination: 'Berlin', international: true,
        startDate: '2026-11-12', endDate: '2026-11-19', purpose: 'Summit',
      },
    },
  });
  const travelSubmitted = await api(`/requests/${travel.data.id}/submit`, { method: 'POST', token: employee.token });
  check('international travel is HIGH risk', travelSubmitted.data.risk.level === 'HIGH',
    `score ${travelSubmitted.data.risk.score}`);

  const travelManagerStep = await pendingStepFor(manager.token, travel.data.id, 'MANAGER');
  const afterManager = await api(`/approvals/${travelManagerStep}/approve`, {
    method: 'POST', token: manager.token, body: { comment: 'Approved' },
  });
  const stage2 = afterManager.data.workflow.steps.filter((s) => s.stepOrder === 2);
  check('Finance and Compliance both become PENDING together',
    stage2.length === 2 && stage2.every((s) => s.status === 'PENDING'),
    stage2.map((s) => `${s.approverRole}:${s.status}`).join(', '));
  check('Director stays WAITING while the parallel stage is open',
    afterManager.data.workflow.steps.find((s) => s.approverRole === 'DIRECTOR').status === 'WAITING');

  const travelFinanceStep = await pendingStepFor(finance.token, travel.data.id, 'FINANCE');
  const afterFinance = await api(`/approvals/${travelFinanceStep}/approve`, {
    method: 'POST', token: finance.token, body: { comment: 'Budget ok' },
  });
  check('Director is STILL WAITING after only one parallel approval',
    afterFinance.data.workflow.steps.find((s) => s.approverRole === 'DIRECTOR').status === 'WAITING');
  check('Compliance remains PENDING and independently actionable',
    afterFinance.data.workflow.steps.find((s) => s.approverRole === 'COMPLIANCE').status === 'PENDING');

  const travelComplianceStep = await pendingStepFor(compliance.token, travel.data.id, 'COMPLIANCE');
  const afterCompliance = await api(`/approvals/${travelComplianceStep}/approve`, {
    method: 'POST', token: compliance.token, body: { comment: 'Cleared' },
  });
  check('Director becomes PENDING once BOTH parallel approvals are in',
    afterCompliance.data.workflow.steps.find((s) => s.approverRole === 'DIRECTOR').status === 'PENDING');

  const travelDirectorStep = await pendingStepFor(director.token, travel.data.id, 'DIRECTOR');
  const travelFinal = await api(`/approvals/${travelDirectorStep}/approve`, {
    method: 'POST', token: director.token, body: { comment: 'Approved' },
  });
  check('parallel workflow completes as APPROVED', travelFinal.data.status === 'APPROVED');

  /* ------------------------- 10. visibility ------------------------------- */
  console.log('\n10. Request visibility (RBAC)');
  const other = await login('employee2@company.com');
  const forbidden = await api(`/requests/${requestId}`, { token: other.token });
  check('an unrelated employee cannot read someone else\'s request', forbidden.status === 403);

  const ownList = await api('/requests', { token: other.token });
  check('an employee only sees their own requests',
    (ownList.data || []).every((r) => r.requester.email === 'employee2@company.com'),
    `${(ownList.data || []).length} requests`);

  /* ---------------------------- summary ----------------------------------- */
  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nTest run crashed:', error);
  process.exit(1);
});
