/**
 * lib/meta-capi.js
 * Meta Conversions API (server-side pixel) — "bundling"
 * Hantar event terus dari server ke Meta, bypass browser restrictions (iOS, adblocker)
 *
 * Pixel ID  : 1326118405768473
 * Docs      : https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const crypto  = require('crypto');
const https   = require('https');

const PIXEL_ID    = '1326118405768473';
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN || '';
const API_VERSION  = 'v19.0';
const ENDPOINT     = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;

/** Hash SHA-256 untuk user data (required by Meta) */
function hash(value) {
    if (!value) return undefined;
    return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

/**
 * Hantar satu atau lebih events ke Meta CAPI
 *
 * @param {Array<{
 *   eventName: string,          // 'InitiateCheckout' | 'Purchase' | 'AddToCart'
 *   eventId?: string,           // dedup dengan browser pixel (guna orderId)
 *   sourceUrl?: string,
 *   phone?: string,
 *   value?: number,
 *   currency?: string,
 *   contentName?: string,
 *   clientIp?: string,
 *   userAgent?: string,
 * }>} events
 */
async function sendCapiEvents(events) {
    if (!ACCESS_TOKEN) {
        console.warn('[meta-capi] META_CAPI_TOKEN tidak diset, skip CAPI');
        return;
    }

    const payload = {
        data: events.map(e => ({
            event_name     : e.eventName,
            event_time     : Math.floor(Date.now() / 1000),
            event_id       : e.eventId || undefined,
            event_source_url: e.sourceUrl || 'https://tabitaofficial.com/link.html',
            action_source  : 'website',
            user_data      : {
                ph                 : e.phone ? [hash(e.phone)] : undefined,
                client_ip_address  : e.clientIp  || undefined,
                client_user_agent  : e.userAgent || undefined,
            },
            custom_data    : {
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

    return new Promise((resolve) => {
        const req = https.request(url, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, res => {
            let raw = '';
            res.on('data', c => (raw += c));
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error('[meta-capi] HTTP', res.statusCode, raw.slice(0, 300));
                }
                resolve();
            });
        });
        req.on('error', err => { console.error('[meta-capi] error:', err.message); resolve(); });
        req.write(body);
        req.end();
    });
}

module.exports = { sendCapiEvents };
