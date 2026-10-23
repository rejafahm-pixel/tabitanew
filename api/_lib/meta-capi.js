/**
 * api/_lib/meta-capi.js
 * Meta Conversions API (server-side pixel)
 * Hantar event terus dari server ke Meta, bypass browser restrictions (iOS, adblocker).
 *
 * Event browser & server mesti guna event_id + event_name yang SAMA — Meta
 * gabungkan jadi satu (deduplication), tak dikira dua kali.
 *
 * Pixel ID  : 1326118405768473
 * Docs      : https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const crypto  = require('crypto');
const https   = require('https');

const PIXEL_ID     = '1326118405768473';
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN || '';
const API_VERSION  = 'v22.0';
const ENDPOINT     = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;
const TIMEOUT_MS   = 3000;

/** Hash SHA-256 untuk user data (required by Meta) */
function hash(value) {
    if (!value) return undefined;
    return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

/** Nombor Malaysia dalam format antarabangsa tanpa '+': 0123456789 → 60123456789 */
function phoneIntl(raw) {
    let d = String(raw || '').replace(/[^0-9]/g, '');
    if (!d) return '';
    if (d.startsWith('0')) d = '6' + d;
    return d;
}

/** IP pertama dari x-forwarded-for (Vercel boleh beri senarai "ip, proxy, ...") */
function clientIp(req) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return xf || req.socket?.remoteAddress || undefined;
}

/**
 * Hantar satu atau lebih events ke Meta CAPI. Tak pernah throw — kegagalan
 * cuma dilog, supaya tempahan pembeli tak terganggu.
 *
 * @param {Array<{
 *   eventName: string,          // 'AddToCart' | 'Purchase'
 *   eventId?: string,           // SAMA dengan eventID pixel browser (dedup)
 *   sourceUrl?: string,
 *   phone?: string,
 *   value?: number,
 *   currency?: string,
 *   contentName?: string,
 *   req?: object,               // request Vercel — untuk IP & user agent
 *   fbp?: string,
 *   fbc?: string,
 * }>} events
 */
async function sendCapiEvents(events) {
    if (!ACCESS_TOKEN) {
        console.warn('[meta-capi] META_CAPI_TOKEN tidak diset, skip CAPI');
        return;
    }

    const payload = {
        data: events.map(e => ({
            event_name      : e.eventName,
            event_time      : Math.floor(Date.now() / 1000),
            event_id        : e.eventId || undefined,
            event_source_url: e.sourceUrl || 'https://tabitaofficial.com/',
            action_source   : 'website',
            user_data       : {
                ph                : e.phone ? [hash(phoneIntl(e.phone))] : undefined,
                client_ip_address : e.req ? clientIp(e.req) : undefined,
                client_user_agent : e.req ? (e.req.headers['user-agent'] || undefined) : undefined,
                fbp               : e.fbp || undefined,
                fbc               : e.fbc || undefined,
            },
            custom_data     : {
                value        : e.value    || undefined,
                currency     : e.currency || 'MYR',
                content_name : e.contentName || undefined,
                content_type : 'product',
            },
        })),
        // test_event_code: 'TEST12345', // nyahkomen untuk test di Events Manager
    };

    const body = JSON.stringify(payload);
    const url  = `${ENDPOINT}?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
    const nama = events.map(e => `${e.eventName}:${e.eventId || '-'}`).join(',');

    return new Promise((resolve) => {
        const req = https.request(url, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            timeout: TIMEOUT_MS,
        }, res => {
            let raw = '';
            res.on('data', c => (raw += c));
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error('[meta-capi] gagal', nama, 'HTTP', res.statusCode, raw.slice(0, 300));
                } else {
                    console.log('[meta-capi] ok', nama, raw.slice(0, 120));
                }
                resolve();
            });
        });
        req.on('timeout', () => { console.error('[meta-capi] timeout', nama); req.destroy(); });
        req.on('error', err => { console.error('[meta-capi] error', nama, err.message); resolve(); });
        req.write(body);
        req.end();
    });
}

module.exports = { sendCapiEvents };
