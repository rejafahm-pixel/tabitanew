const {
    SECRET,
    CATEGORY,
    API_BASE,
    AMOUNT_SEN,
    AMOUNT_RM,
    PRODUCT,
    BILL_NAME,
    sanitize,
    digitsPhone,
    siteOrigin,
    toyyibPost,
    generateDuitNowQr,
    startFpxPayment,
    FPX_BANKS
} = require('./_lib/toyyibpay');
const { saveOrder } = require('./_lib/tracknotify');

function sendCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
    let body = req.body;
    if (!body) return {};
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
    sendCors(res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        const body = parseBody(req);
        const nama   = String(body.nama   || '').trim();
        const telefon = String(body.telefon || '').trim();
        const alamat  = String(body.alamat  || '').trim();
        const poskod  = String(body.poskod  || '').trim();
        const bandar  = String(body.bandar  || '').trim();
        const negeri  = String(body.negeri  || '').trim();
        const kaedah  = String(body.kaedah  || body.method || 'toyyibpay').trim();
        const bank    = String(body.bank    || '').trim();
        const wantFpx = kaedah === 'fpx';

        // Whitelist harga — hanya 135 atau 249 dibenarkan
        const ALLOWED_PRICES = { '135': { sen: 13500, produk: 'SET EKSKLUSIF TABITA ORIGINAL JAKARTA',            bill: 'Tabita Exclusive Set',  desc: 'Set Eksklusif Tabita RM135' },
                                  '249': { sen: 24900, produk: 'PAKEJ BERDUA 2 SET EKSKLUSIF TABITA + FREE SERUM 15ML', bill: 'Tabita Pakej Berdua', desc: 'Pakej Berdua 2 Set Tabita RM249' } };
        const hargaKey  = String(body.harga || '135').trim();
        const pkgConfig = ALLOWED_PRICES[hargaKey] || ALLOWED_PRICES['135'];
        const harga     = hargaKey in ALLOWED_PRICES ? hargaKey : '135';
        const amountSen = pkgConfig.sen;
        const produk    = pkgConfig.produk;
        const billName  = pkgConfig.bill;

        if (!nama || !telefon || !alamat || !poskod || !bandar || !negeri) {
            return res.status(400).json({ success: false, error: 'Maklumat pesanan tidak lengkap' });
        }

        const phone = digitsPhone(telefon);
        if (phone.length < 10) {
            return res.status(400).json({ success: false, error: 'Nombor telefon tidak sah' });
        }

        if (wantFpx && !FPX_BANKS.some((item) => item.code === bank)) {
            return res.status(400).json({ success: false, error: 'Sila pilih bank FPX' });
        }

        const orderId = 'TAB-' + Date.now();
        const origin = siteOrigin(req);

        const returnParams = new URLSearchParams({
            nama,
            telefon,
            alamat,
            poskod,
            bandar,
            negeri,
            produk,
            harga,
            kaedah: wantFpx ? 'fpx' : 'toyyibpay',
            ref: orderId
        });

        const billDescription = sanitize(
            `Pesanan ${nama} ${phone} ${bandar} ${negeri} RM${harga}`,
            100
        );

        const { data } = await toyyibPost('/index.php/api/createBill', {
            userSecretKey: SECRET,
            categoryCode: CATEGORY,
            billName: billName,
            billDescription: sanitize(`Pesanan ${nama} ${phone} ${bandar} ${negeri} RM${harga}`, 100) || pkgConfig.desc,
            billPriceSetting: '1',
            billPayorInfo: '0',
            billAmount: String(amountSen),
            billReturnUrl: `${origin}/paid.html?${returnParams.toString()}`,
            billCallbackUrl: `${origin}/api/toyyibpay-callback`,
            billExternalReferenceNo: orderId,
            billTo: sanitize(nama, 50) || 'Pelanggan Tabita',
            billEmail: 'pesanan@tabitaofficial.com',
            billPhone: phone,
            billSplitPayment: '0',
            billPaymentChannel: '0',
            billContentEmail: 'Terima kasih. Pesanan Set Eksklusif Tabita RM135 anda sedang diproses.',
            enableDuitNowQR: '1',
            chargeDuitNowQR: '0',
            billExpiryDays: '3'
        });

        if (Array.isArray(data) && data[0] && data[0].BillCode) {
            const billCode = data[0].BillCode;
            const billUrl = `${API_BASE}/${billCode}`;
            const payerName = sanitize(nama, 50) || 'Pelanggan Tabita';

            // Simpan order ke TrackNotify (non-blocking)
            saveOrder({
                nama, telefon, alamat, poskod, bandar, negeri,
                produk, harga,
                kaedah: wantFpx ? 'FPX' : 'DuitNow/ToyyibPay',
                notes: orderId,
                event_source_url: String(body.event_source_url || '').slice(0, 2000)
            }).catch(err => console.error('[tracknotify] gagal simpan order:', err.message));


            if (wantFpx) {
                let fpx = null;
                try {
                    fpx = await startFpxPayment(billCode, {
                        name: payerName,
                        email: 'pesanan@tabitaofficial.com',
                        phone,
                        bank
                    });
                } catch (err) {
                    console.error('[toyyibpay] fpx start failed', err.message);
                }
                if (fpx) {
                    return res.status(200).json({
                        success: true,
                        method: 'fpx',
                        billUrl,
                        billCode,
                        orderId,
                        fpx
                    });
                }
                return res.status(200).json({
                    success: true,
                    method: 'fpx',
                    billUrl,
                    billCode,
                    orderId
                });
            }

            let qr = null;
            try {
                qr = await generateDuitNowQr(billCode, {
                    name: payerName,
                    email: 'pesanan@tabitaofficial.com',
                    phone
                });
            } catch (err) {
                console.error('[toyyibpay] duitnow generate failed', err.message);
            }

            return res.status(200).json({
                success: true,
                method: 'duitnow',
                billUrl,
                billCode,
                orderId,
                qrDataUrl: qr ? qr.qrDataUrl : null,
                invoiceNo: qr ? qr.invoiceNo : null,
                expirySeconds: qr ? qr.expirySeconds : null
            });
        }

        return res.status(400).json({
            success: false,
            error: 'ToyyibPay tidak dapat cipta bill',
            detail: data
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
