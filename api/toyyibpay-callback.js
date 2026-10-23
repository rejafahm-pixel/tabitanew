const { callbackHash } = require('./_lib/toyyibpay');

function parseBody(req) {
    let body = req.body;
    if (!body) return { ...req.query };
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch (_) {
            return Object.fromEntries(new URLSearchParams(body));
        }
    }
    return body;
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const payload = parseBody(req);
        const status = String(payload.status || payload.status_id || '');
        const orderId = String(payload.order_id || '');
        const refno = String(payload.refno || payload.transaction_id || '');
        const billcode = String(payload.billcode || payload.billCode || '');
        const receivedHash = String(payload.hash || '').toLowerCase();

        let hashOk = null;
        if (receivedHash && status && orderId && refno) {
            hashOk = receivedHash === callbackHash(status, orderId, refno);
        }

        console.log('[toyyibpay-callback]', {
            status,
            orderId,
            refno,
            billcode,
            amount: payload.amount || null,
            reason: payload.reason || null,
            hashOk
        });

        res.status(200).send('OK');
    } catch (err) {
        console.error('[toyyibpay-callback] error', err.message);
        res.status(200).send('OK');
    }
};
