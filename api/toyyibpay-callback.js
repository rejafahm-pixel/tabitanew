const { callbackHash, toyyibPost } = require('./_lib/toyyibpay');
const { sendCapiEvents } = require('./_lib/meta-capi');

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

        // CAPI Purchase — hanya selepas toyyibPay sendiri sahkan bil ini dibayar
        // (tidak percaya hash sahaja). event_id 'PUR-<orderId>' sama dengan paid.html.
        if (status === '1' && billcode) {
            const { data } = await toyyibPost('/index.php/api/getBillTransactions', { billCode: billcode });
            const paid = (Array.isArray(data) ? data : []).find((row) => String(row.billpaymentStatus) === '1');
            if (paid) {
                const ref = String(paid.billExternalReferenceNo || orderId);
                await sendCapiEvents([{
                    eventName : 'Purchase',
                    eventId   : 'PUR-' + ref,
                    sourceUrl : 'https://tabitaofficial.com/paid.html',
                    value     : Number(paid.billpaymentAmount) || Number(payload.amount) || 135,
                    currency  : 'MYR',
                }]);
            } else {
                console.warn('[toyyibpay-callback] status=1 tapi toyyibPay tak sahkan bayaran — Purchase tidak dihantar', billcode);
            }
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('[toyyibpay-callback] error', err.message);
        res.status(200).send('OK');
    }
};
