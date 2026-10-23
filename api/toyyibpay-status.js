const { toyyibPost } = require('../lib/toyyibpay');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (_) {
                body = Object.fromEntries(new URLSearchParams(body));
            }
        }

        const billcode = String(
            (req.query && (req.query.billcode || req.query.billCode)) ||
                (body && (body.billcode || body.billCode)) ||
                ''
        ).trim();
        const invno = String(
            (req.query && (req.query.invno || req.query.invoiceNo)) ||
                (body && (body.invno || body.invoiceNo)) ||
                ''
        ).trim();

        if (invno) {
            try {
                const check = await fetch(
                    'https://toyyibpay.com/bill/checkDuitNowQRStatus?invno=' + encodeURIComponent(invno)
                );
                const dn = await check.json();
                if (dn && dn.status === 'success') {
                    return res.status(200).json({
                        success: true,
                        billcode,
                        paid: true,
                        status: 'paid',
                        invoiceNo: invno,
                        channel: 'DuitNow QR',
                        redirectUrl: dn.redirectUrl || null
                    });
                }
            } catch (_) {
                /* fall through to bill transactions */
            }
        }

        if (!billcode) {
            return res.status(400).json({ success: false, error: 'billcode diperlukan' });
        }

        const { data } = await toyyibPost('/index.php/api/getBillTransactions', {
            billCode: billcode
        });

        const rows = Array.isArray(data) ? data : [];
        const paidRow = rows.find((row) => String(row.billpaymentStatus) === '1');
        const latest = paidRow || rows[0] || null;
        const payStatus = latest ? String(latest.billpaymentStatus) : '';

        let status = 'unknown';
        if (payStatus === '1') status = 'paid';
        else if (payStatus === '2' || payStatus === '4') status = 'pending';
        else if (payStatus === '3') status = 'failed';
        else if (!latest) status = 'unknown';

        return res.status(200).json({
            success: true,
            billcode,
            paid: status === 'paid',
            status,
            amount: latest ? latest.billpaymentAmount : null,
            invoiceNo: latest ? latest.billpaymentInvoiceNo : null,
            channel: latest ? latest.billpaymentChannel : null,
            orderId: latest ? latest.billExternalReferenceNo : null
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
