const API_BASE = 'https://communities-api.berjis.tech';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'berjisPost') {
    return;
  }

  (async () => {
    try {
      const payload = message.payload || {};
      const resp = await fetch(API_BASE + '/v1/posts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.title || undefined,
          body: payload.body,
          kind: 'post',
          visibility: 'public',
          media: payload.media || []
        })
      });

      const text = await resp.text().catch(() => '');
      sendResponse({
        ok: resp.ok,
        status: resp.status,
        body: text
      });
    } catch (err) {
      sendResponse({
        ok: false,
        error: String(err)
      });
    }
  })();

  // Keep the message channel open for the async response
  return true;
});

