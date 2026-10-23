/**
 * api/cod-order.js
 * Endpoint untuk terima dan simpan order COD ke TrackNotify
 * Dipanggil dari link.html / index.html bila pelanggan pilih COD
 */
const { saveOrder } = require('./_lib/tracknotify');
const { sendCapiEvents } = require('./_lib/meta-capi');
const { PRODUCT, AMOUNT_RM, digitsPhone } = require('./_lib/toyyibpay');

function sendCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
    let body = req.body;
    if (!body) return {};
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch (_) {
            return Object.fromEntries(new URLSearchParams(body));
        }
    }
    return body;
}

module.exports = async (req, res) => {
    sendCors(res);

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        const body    = parseBody(req);
        const nama    = String(body.nama    || body.customer_name || '').trim();
        const telefon = String(body.telefon || body.phone         || '').trim();
        const alamat  = String(body.alamat  || body.address       || '').trim();
        const poskod  = String(body.poskod  || body.postal_code   || '').trim();
        const bandar  = String(body.bandar  || body.city          || '').trim();
        const negeri  = String(body.negeri  || body.state         || '').trim();
        const produk  = String(body.produk  || body.product_name  || PRODUCT).trim();
        const harga   = Number(body.harga   || body.price         || AMOUNT_RM);

        if (!nama || !telefon || !alamat) {
            return res.status(400).json({ success: false, error: 'Nama, telefon, dan alamat diperlukan' });
        }

        const phone = digitsPhone(telefon);
        if (phone.length < 10) {
            return res.status(400).json({ success: false, error: 'Nombor telefon tidak sah' });
        }

        const order = await saveOrder({
            nama, telefon: phone, alamat, poskod, bandar, negeri,
            produk, harga,
            kaedah: 'COD',
            notes: `COD - ${new Date().toISOString()}`,
            event_source_url: String(body.event_source_url || '').slice(0, 2000)
        });


        // CAPI AddToCart — event_id sama dengan pixel browser (dedup)
        await sendCapiEvents([{
            eventName   : 'AddToCart',
            eventId     : String(body.event_id || '').slice(0, 100) || undefined,
            sourceUrl   : String(body.event_source_url || '').slice(0, 1000) || undefined,
            phone,
            value       : Number(harga) || 135,
            currency    : 'MYR',
            contentName : produk,
            req,
            fbp         : String(body.fbp || '').slice(0, 200),
            fbc         : String(body.fbc || '').slice(0, 500),
        }]);

        return res.status(200).json({
            success : true,
            orderId : order.id,
            message : 'Order COD berjaya disimpan'
        });

    } catch (err) {
        console.error('[cod-order] error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
