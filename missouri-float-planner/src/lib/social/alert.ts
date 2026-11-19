// Optional operator alert. When SOCIAL_ALERT_WEBHOOK_URL is set, a JSON payload
// is POSTed there (Slack incoming-webhook format works). Never throws: an
// alert that cannot be delivered must not change what happens to a post.
export async function socialAlert(text: string): Promise<void> {
  const url = process.env.SOCIAL_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('[social] Alert webhook failed:', err);
  }
}
