export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry(callback, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callback();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      await sleep(delay);
    }
  }
}

export function randomString(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
