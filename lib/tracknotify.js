/**
 * TrackNotify integration — simpan order ke https://tracknotify-production.up.railway.app
 *
 * Store IDs:
 *   Tabita LP   : 43263b25-2ba3-4db5-a9d5-5debc0c41d95  (online payment)
 *   Tabita CTWA : ce027abf-d9df-4c5d-9f3d-cb302fe5ca48  (COD)
 */

const TRACKNOTIFY_URL = 'https://tracknotify-production.up.railway.app';
const STORE_LP  = '43263b25-2ba3-4db5-a9d5-5debc0c41d95'; // online payment (ToyyibPay)
const STORE_COD = 'ce027abf-d9df-4c5d-9f3d-cb302fe5ca48'; // COD / CTWA

async function getToken() {
    const email    = process.env.TRACKNOTIFY_EMAIL    || 'tabita@gmail.com';
    const password = process.env.TRACKNOTIFY_PASSWORD || 'tabita1234';

    const res = await fetch(`${TRACKNOTIFY_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!res.ok) throw new Error(`TrackNotify login gagal: ${res.status}`);
    const data = await res.json();
    if (!data.token) throw new Error('TrackNotify: token tidak diterima');
    return data.token;
}

/**
 * Simpan order ke TrackNotify
 * @param {object} order
 * @param {'lp'|'cod'} type - 'lp' untuk online payment, 'cod' untuk COD
 */
async function saveOrder(order, type = 'lp') {
    const token    = await getToken();
    const store_id = type === 'cod' ? STORE_COD : STORE_LP;

    const payload = {
        store_id,
        customer_name  : order.nama     || order.customer_name || '-',
        phone          : order.telefon  || order.phone         || '',
        address        : order.alamat   || order.address       || '-',
        city           : order.bandar   || order.city          || '-',
        postal_code    : order.poskod   || order.postal_code   || '',
        state          : order.negeri   || order.state         || '-',
        product_name   : order.produk   || order.product_name  || 'SET EKSKLUSIF TABITA ORIGINAL JAKARTA',
        quantity       : order.quantity || 1,
        price          : order.harga    || order.price         || 135,
        payment_method : order.kaedah   || order.payment_method|| (type === 'cod' ? 'COD' : 'Online'),
        status         : 'pending',
        notes          : order.notes    || order.ref           || ''
    };

    const res = await fetch(`${TRACKNOTIFY_URL}/api/orders`, {
        method: 'POST',
        headers: {
            'Content-Type'  : 'application/json',
            'Authorization' : `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`TrackNotify order gagal: ${JSON.stringify(data)}`);
    return data;
}

module.exports = { saveOrder, STORE_LP, STORE_COD };
