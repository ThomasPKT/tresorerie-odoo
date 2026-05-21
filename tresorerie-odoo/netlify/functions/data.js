// netlify/functions/data.js
const { odooSearch, delay, respond, corsHeaders } = require('./_odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  try {
    const { odooUrl, db, uid, apiKey, companyId } = JSON.parse(event.body);
    const companyFilter = companyId ? [['company_id','=',companyId]] : [];

    const cliInv = await odooSearch(odooUrl, db, uid, apiKey, 'account.move',
      [['move_type','=','out_invoice'],['payment_state','in',['not_paid','partial']],['state','=','posted'],...companyFilter],
      ['name','partner_id','invoice_date_due','amount_residual','company_id']);
    await delay(300);

    const cliCred = await odooSearch(odooUrl, db, uid, apiKey, 'account.move',
      [['move_type','=','out_refund'],['payment_state','in',['not_paid','partial']],['state','=','posted'],...companyFilter],
      ['name','partner_id','invoice_date_due','amount_residual','company_id']);
    await delay(300);

    const supInv = await odooSearch(odooUrl, db, uid, apiKey, 'account.move',
      [['move_type','=','in_invoice'],['payment_state','in',['not_paid','partial']],['state','=','posted'],...companyFilter],
      ['name','partner_id','invoice_date_due','amount_residual','company_id']);
    await delay(300);

    const supCred = await odooSearch(odooUrl, db, uid, apiKey, 'account.move',
      [['move_type','=','in_refund'],['payment_state','in',['not_paid','partial']],['state','=','posted'],...companyFilter],
      ['name','partner_id','invoice_date_due','amount_residual','company_id']);
    await delay(300);

    const orders = await odooSearch(odooUrl, db, uid, apiKey, 'sale.order',
      [['state','in',['sale','done']],['invoice_status','in',['to invoice','nothing']],...companyFilter],
      ['name','partner_id','date_order','commitment_date','amount_untaxed','company_id'], 500);

    return respond(200, { cliInv, cliCred, supInv, supCred, orders });
  } catch(e) {
    return respond(502, { error: e.message });
  }
};
