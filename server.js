import 'dotenv/config';
import express from 'express';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const SITE_NAME = 'Ebooks Sales';

app.use(express.json());

// Landing page (dinâmica com SITE_NAME)
app.get('/', (req, res) => {
  try {
    const html = readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const rendered = html.replace(/\{\{SITE_NAME\}\}/g, SITE_NAME);
    res.type('html').send(rendered);
  } catch {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Arquivos estáticos (CSS, imagens, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// PayPal Checkout - máscara para o checkout (PayPal vê este domínio como merchant)
app.get('/api/paypal-checkout', (req, res) => {
  try {
    const { amount, currency = 'USD', video_id, success_url, cancel_url, product_name } = req.query;

    if (!amount || !success_url || !cancel_url) {
      return res.status(400).send('Missing required parameters');
    }

    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    if (!paypalClientId) {
      return res.status(500).send('PayPal Client ID not configured. Set PAYPAL_CLIENT_ID in Render.');
    }

    const isSandbox = paypalClientId.includes('sandbox') || paypalClientId.includes('test');
    const paypalScriptUrl = `https://www.paypal.com/sdk/js?client-id=${paypalClientId}&currency=USD`;

    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    const displayName = product_name || 'Digital Ebook';
    const escapeForJs = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/`/g, '\\`').replace(/\r/g, '').replace(/\n/g, '');
    const safeName = escapeForJs(displayName);
    const safeSuccess = escapeForJs(success_url);
    const safeCancel = escapeForJs(cancel_url);
    const safeBrand = escapeForJs(SITE_NAME);

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Referrer-Policy" content="no-referrer">
  <title>Checkout - ${SITE_NAME}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #eee;
      padding: 20px;
    }
    .container {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .brand { font-size: 1.1rem; color: #8b9dc3; margin-bottom: 0.5rem; }
    h1 { font-size: 1.3rem; margin-bottom: 0.5rem; }
    .product { color: #aab; font-size: 0.9rem; margin-bottom: 1rem; word-break: break-word; }
    .amount { font-size: 2rem; font-weight: 700; color: #4fc3f7; margin-bottom: 1.5rem; text-align: center; }
    #paypal-button-container { margin-top: 0.5rem; }
    .loading { text-align: center; color: #888; margin-top: 0.5rem; font-size: 0.9rem; }
    .security-notice {
      margin-top: 1rem;
      padding: 0.75rem;
      background: rgba(79,195,247,0.1);
      border-left: 3px solid #4fc3f7;
      border-radius: 6px;
      font-size: 0.8rem;
      color: #aab;
      line-height: 1.4;
    }
    .security-notice strong { color: #8b9dc3; }
  </style>
  <script>
    (function(){
      if (window.history && window.history.replaceState) window.history.replaceState(null,null,window.location.href);
      try { sessionStorage.removeItem('origin'); localStorage.removeItem('origin'); } catch(e){}
    })();
  </script>
  <script src="${paypalScriptUrl}" data-namespace="paypal_sdk" referrerpolicy="no-referrer"></script>
</head>
<body>
  <div class="container">
    <div class="brand">${SITE_NAME}</div>
    <h1>Complete Your Purchase</h1>
    <div class="product">${safeName}</div>
    <div class="amount">$${parseFloat(amount).toFixed(2)} ${currency}</div>
    <div id="paypal-button-container"></div>
    <div class="loading" id="loading">Loading PayPal...</div>
    <div class="security-notice">
      <strong>Security Notice:</strong> For security reasons, the payment may appear under a different merchant name on your statement.
    </div>
  </div>
  <script>
    (function(){
      var SUCCESS_URL = '${safeSuccess}';
      var CANCEL_URL = '${safeCancel}';
      function initPayPal(){
        if (typeof paypal_sdk === 'undefined' || !paypal_sdk.Buttons) { setTimeout(initPayPal,100); return; }
        document.getElementById('loading').style.display='none';
        paypal_sdk.Buttons({
          createOrder: function(data, actions) {
            return actions.order.create({
              purchase_units: [{
                description: '${safeName}',
                amount: { value: '${parseFloat(amount).toFixed(2)}', currency_code: '${currency}' }
              }],
              application_context: {
                brand_name: '${safeBrand}',
                landing_page: 'NO_PREFERENCE',
                user_action: 'PAY_NOW'
              }
            });
          },
          onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
              var sep = SUCCESS_URL.indexOf('?') >= 0 ? '&' : '?';
              window.location.href = SUCCESS_URL + sep + 'order_id=' + data.orderID + '&payer_id=' + (details.payer && details.payer.payer_id ? details.payer.payer_id : '');
            });
          },
          onCancel: function() { window.location.href = CANCEL_URL; },
          onError: function(err) { console.error(err); alert('Payment error. Please try again.'); },
          style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal' }
        }).render('#paypal-button-container');
      }
      initPayPal();
    })();
  </script>
</body>
</html>
    `);
  } catch (err) {
    console.error('PayPal checkout error:', err);
    res.status(500).send('Checkout failed');
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', site: SITE_NAME });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`${SITE_NAME} running on port ${PORT}`);
});
