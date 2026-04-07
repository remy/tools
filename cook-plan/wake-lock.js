// =============================================
// Cook Planner — wake-lock.js
// =============================================

// Module-private state
let wakeLock = null;

export async function toggleWakeLock() {
  if (wakeLock) {
    await releaseWakeLock();
  } else {
    await requestWakeLock();
  }
}

export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    alert('Wake lock is not supported in this browser.');
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      updateWakeLockBtn();
    });
    updateWakeLockBtn();
  } catch (e) {
    console.warn('Wake lock failed:', e);
  }
}

export async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
    updateWakeLockBtn();
  }
}

export function updateWakeLockBtn() {
  const btn = document.getElementById('wake-lock-btn');
  if (!btn) return;
  if (wakeLock) {
    btn.textContent = '\ud83d\udd06 Awake (tap to release)';
    btn.classList.add('active');
  } else {
    btn.textContent = '\ud83d\udd06 Keep awake';
    btn.classList.remove('active');
  }
}
