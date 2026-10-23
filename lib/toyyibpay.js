const crypto = require('crypto');

const SECRET   = process.env.TOYYIBPAY_SECRET_KEY   || '';
const CATEGORY = process.env.TOYYIBPAY_CATEGORY_CODE || '';
const API_BASE = 'https://toyyibpay.com';
const AMOUNT_SEN = 13500;
const AMOUNT_RM = '135';
const PRODUCT = 'SET EKSKLUSIF TABITA ORIGINAL JAKARTA';
const BILL_NAME = 'Tabita Exclusive Set';

function sanitize(text, max) {
    return String(text || '')
        .replace(/[^a-zA-Z0-9 _]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function digitsPhone(raw) {
    let d = String(raw || '').replace(/[^0-9]/g, '');
    if (d.startsWith('60') && d.length >= 11) d = '0' + d.slice(2);
    return d;
}

function siteOrigin(req) {
    if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.headers.host || 'tabitaofficial.com')
        .split(',')[0]
        .trim();
    return `${proto}://${host}`;
}

function callbackHash(status, orderId, refno) {
    return crypto
        .createHash('md5')
        .update(`${SECRET}${status}${orderId}${refno}ok`)
        .digest('hex');
}

async function toyyibPost(path, fields) {
    const body = new URLSearchParams(fields);
    const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    const text = await response.text();
    let data = text;
    try {
        data = JSON.parse(text);
    } catch (_) {
        /* ToyyibPay sometimes returns a plain string like [CATEGORY-NOT-MATCH] */
    }
    return { ok: response.ok, data, text };
}

async function generateDuitNowQr(billCode, { name, email, phone }) {
    const response = await fetch(`${API_BASE}/${billCode}?mode=paymentDuitNowQR`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html'
        },
        body: new URLSearchParams({
            payment_amount: `${AMOUNT_RM}.00`,
            email: email || 'pesanan@tabitaofficial.com',
            name: name || 'Pelanggan Tabita',
            phone: phone || '0120000000',
            agree: '1'
        }).toString()
    });
    const html = await response.text();
    const qrMatch = html.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
    if (!qrMatch) return null;
    const invMatch = html.match(/var invno = "([^"]+)"/);
    const expMatch = html.match(/var expirySeconds = (\d+)/);
    return {
        qrDataUrl: 'data:image/png;base64,' + qrMatch[1],
        invoiceNo: invMatch ? invMatch[1] : null,
        expirySeconds: expMatch ? Number(expMatch[1]) : 300
    };
}

const FPX_BANKS = [
    { code: 'MB2U0227', name: 'Maybank2U' },
    { code: 'BCBB0235', name: 'CIMB Clicks' },
    { code: 'BIMB0340', name: 'Bank Islam' },
    { code: 'RHB0218', name: 'RHB Bank' },
    { code: 'PBB0233', name: 'Public Bank' },
    { code: 'HLB0224', name: 'Hong Leong Bank' },
    { code: 'ABB0233', name: 'Affin Bank' },
    { code: 'ABMB0212', name: 'Alliance Bank' },
    { code: 'AMBB0209', name: 'AmBank' },
    { code: 'BMMB0341', name: 'Bank Muamalat' },
    { code: 'BKRM0602', name: 'Bank Rakyat' },
    { code: 'BSN0601', name: 'BSN' },
    { code: 'AGRO01', name: 'AGRONet' },
    { code: 'BOCM01', name: 'Bank of China' },
    { code: 'HSBC0223', name: 'HSBC' },
    { code: 'KFH0346', name: 'KFH' },
    { code: 'OCBC0229', name: 'OCBC' },
    { code: 'SCB0216', name: 'Standard Chartered' },
    { code: 'UOB0226', name: 'UOB' },
    { code: 'MBSB001', name: 'MBSB' }
];

function parseFpxForm(html) {
    const formMatch = html.match(/<form[^>]*(?:id|name)="fpxForm"[^>]*>([\s\S]*?)<\/form>/i);
    if (!formMatch) return null;
    const tag = html.match(/<form[^>]*(?:id|name)="fpxForm"[^>]*>/i);
    const actionMatch = tag && tag[0].match(/action="([^"]+)"/i);
    const action = actionMatch ? actionMatch[1] : '';
    if (!/^https:\/\/(www\.)?mepsfpx\.com\.my\//i.test(action)) return null;
    const fields = {};
    const chunk = formMatch[1];
    const re = /<input\b[^>]*>/gi;
    let m;
    while ((m = re.exec(chunk))) {
        const tagHtml = m[0];
        const name = (tagHtml.match(/\bname="([^"]*)"/i) || [])[1];
        if (!name) continue;
        const value = (tagHtml.match(/\bvalue="([^"]*)"/i) || [])[1] || '';
        fields[name] = value;
    }
    if (!fields.fpx_sellerId || !fields.fpx_checkSum) return null;
    return { action, fields };
}

async function startFpxPayment(billCode, { name, email, phone, bank }) {
    const allowed = FPX_BANKS.some((b) => b.code === bank);
    if (!allowed) return null;

    const page = await fetch(`${API_BASE}/${billCode}`, {
        headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' }
    });
    const pageHtml = await page.text();
    const paymentRef = (pageHtml.match(/name="payment_ref_no"[^>]*value="([^"]*)"/i) || [])[1] || '';
    if (!paymentRef) return null;

    const response = await fetch(`${API_BASE}/${billCode}?mode=payment`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html',
            'User-Agent': 'Mozilla/5.0'
        },
        body: new URLSearchParams({
            payment_amount: `${AMOUNT_RM}.00`,
            email: email || 'pesanan@tabitaofficial.com',
            name: name || 'Pelanggan Tabita',
            phone: phone || '0120000000',
            agree: '1',
            account_type: '0',
            bank,
            bankID: '',
            payment_ref_no: paymentRef
        }).toString()
    });
    const html = await response.text();
    return parseFpxForm(html);
}

module.exports = {
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
    callbackHash,
    toyyibPost,
    generateDuitNowQr,
    startFpxPayment,
    FPX_BANKS
};
