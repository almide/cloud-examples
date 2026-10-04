// Cloud Storage as a key -> string store for the Node adapters, with the runtime
// identity's token from the metadata server. Uses only fetch: no SDK dependency.
const METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

async function token() {
  const response = await fetch(METADATA_TOKEN, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!response.ok) throw new Error(`metadata token: HTTP ${response.status}`);
  return (await response.json()).access_token;
}

export function gcsStore(bucket) {
  const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`;
  const upload = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`;
  return {
    async get(key) {
      const response = await fetch(`${base}/${encodeURIComponent(key)}?alt=media`, {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`GCS read: HTTP ${response.status}`);
      return response.text();
    },
    async put(key, value) {
      const response = await fetch(`${upload}?uploadType=media&name=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: value,
      });
      if (!response.ok) throw new Error(`GCS write: HTTP ${response.status}`);
    },
  };
}
