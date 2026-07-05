export async function onRequest() {
  return new Response(JSON.stringify({ ok: true, version: 1 }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
