const BASE_URL = 'https://inspiring-friendship-production-bf42.up.railway.app';
const tg = window.Telegram?.WebApp;

export const headers = () => ({
  'Content-Type': 'application/json',
  'X-Init-Data': tg?.initData ?? '',
});

export async function trackEvent(event, caseId = null, meta = {}) {
  try {
    await fetch(`${BASE_URL}/api/analytics/event`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ event, case_id: caseId, meta }),
    });
  } catch {}
}

export async function getCases() {
  const res = await fetch(`${BASE_URL}/api/cases`, { headers: headers() });
  return res.json();
}

export async function getCase(id) {
  const res = await fetch(`${BASE_URL}/api/cases/${id}`, { headers: headers() });
  return res.json();
}

export async function saveProgress(caseId, data) {
  await fetch(`${BASE_URL}/api/progress/${caseId}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
}

export async function completeCase(caseId, answers) {
  await fetch(`${BASE_URL}/api/progress/${caseId}/complete`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ answers }),
  });
}

export async function useHint(caseId) {
  const res = await fetch(`${BASE_URL}/api/progress/${caseId}/hint`, {
    method: 'POST',
    headers: headers(),
  });
  return res.json();
}
