/**
 * TrackNotify integration — simpan order ke https://tracknotify-production.up.railway.app
 *
 * Semua order website (COD maupun bayar online) masuk ke toko "Tabita LP",
 * lewat webhook order toko itu. Tiada login / password: kunci webhook hanya
 * boleh MENAMBAH order ke toko ini, tak boleh membaca atau mengubah apa-apa.
 *
 * Fail ini di bawah api/_lib supaya Vercel tak menyajikannya sebagai fail awam
 * (dulu di lib/ — boleh dibuka sesiapa di tabitaofficial.com/lib/...).
 */

const TRACKNOTIFY_URL = 'https://tracknotify-production.up.railway.app';
const STORE_LP = '43263b25-2ba3-4db5-a9d5-5debc0c41d95';
const WEBHOOK_KEY = process.env.TRACKNOTIFY_WEBHOOK_KEY || '69bd8036d7b0f36f7d9287bccfc7c8c5';

// Nama produk mesti sama persis dengan produk di TrackNotify, supaya HPP terisi.
function namaProduk(harga) {
    return Number(harga) >= 249
        ? 'Tabita Pakej Berdua (2 Set + Free Serum 15ml)'
        : 'Tabita Exclusive Set';
}

/**
 * Simpan order ke TrackNotify (toko Tabita LP).
 * @param {object} order  nama, telefon, alamat, poskod, bandar, negeri, harga, kaedah,
 *                        notes, event_source_url (URL halaman + UTM iklan, untuk atribusi campaign)
 */
async function saveOrder(order) {
    const harga = Number(order.harga || order.price) || 135;
    const kaedah = String(order.kaedah || order.payment_method || '').toUpperCase();

    const payload = {
        customer_name      : order.nama    || order.customer_name || '-',
        phone              : order.telefon || order.phone         || '',
        address            : order.alamat  || order.address       || '-',
        city               : order.bandar  || order.city          || '',
        postal_code        : order.poskod  || order.postal_code   || '',
        state              : order.negeri  || order.state         || '',
        product_name       : namaProduk(harga),
        quantity           : 1,
        price              : harga,
        payment_method     : kaedah === 'COD' ? 'COD' : 'BANK_TRANSFER',
        landing_page_source: 'tabitaofficial.com',
        event_source_url   : order.event_source_url || '',
        notes              : [order.kaedah, order.notes].filter(Boolean).join(' · ')
    };

    const res = await fetch(`${TRACKNOTIFY_URL}/api/webhook/order/${STORE_LP}?key=${WEBHOOK_KEY}`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`TrackNotify order gagal: ${res.status} ${JSON.stringify(data)}`);
    return { id: data.order_id, ...data };
}

module.exports = { saveOrder, STORE_LP };
