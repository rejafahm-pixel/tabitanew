/**
 * api/capi-event.js
 * Pasangan server (Conversions API) untuk event PageView pixel browser.
 * Halaman hantar event_id yang sama dengan fbq('track','PageView',{}, {eventID}),
 * jadi Meta gabungkan keduanya (tak dikira dua kali).
 *
 * Hanya PageView diterima di sini. AddToCart dihantar oleh api/cod-order &
 * api/toyyibpay; Purchase oleh api/toyyibpay-callback selepas bayaran disahkan
 * toyyibPay — endpoint awam ini tak boleh dipakai untuk memalsukan jualan.
 */
const { sendCapiEvents } = require('./_lib/meta-capi');

function parseBody(req) {
    let body = req.body;
    if (!body) return {};
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch (_) { return {}; }
    }
    return body;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const body = parseBody(req);
    const eventId = String(body.event_id || '').slice(0, 100);
    if (String(body.event_name || '') !== 'PageView' || !/^PV-[\w-]+$/.test(eventId)) {
        return res.status(400).json({ success: false, error: 'Event tidak sah' });
    }

    await sendCapiEvents([{
        eventName : 'PageView',
        eventId,
        sourceUrl : String(body.event_source_url || '').slice(0, 1000) || undefined,
        req,
        fbp       : String(body.fbp || '').slice(0, 200),
        fbc       : String(body.fbc || '').slice(0, 500),
    }]);

    return res.status(204).end();
};
