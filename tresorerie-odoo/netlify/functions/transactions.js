// netlify/functions/transactions.js
const { odooSearch, delay, respond, corsHeaders } = require('./_odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  try {
    const { odooUrl, db, uid, apiKey, companyId, journalId, unreconciled } = JSON.parse(event.body);

    const baseDomain = [['journal_id.type','in',['bank','cash']]];
    if (companyId) baseDomain.push(['company_id','=',companyId]);
    if (journalId) baseDomain.push(['journal_id','=',journalId]);
    if (unreconciled) baseDomain.push(['is_reconciled','=',false]);

    const transactions = await odooSearch(odooUrl, db, uid, apiKey, 'account.bank.statement.line',
      baseDomain,
      ['date','payment_ref','amount','journal_id','company_id','is_reconciled','partner_id'],
      200
    );
    await delay(300);

    const journalDomain = [['type','in',['bank','cash']]];
    if (companyId) journalDomain.push(['company_id','=',companyId]);
    if (journalId) journalDomain.push(['id','=',journalId]);

    const journalsWithBalance = await odooSearch(odooUrl, db, uid, apiKey, 'account.journal',
      journalDomain,
      ['name','company_id','current_statement_balance'],
      50
    );

    return respond(200, { transactions, journalsWithBalance });
  } catch(e) {
    return respond(502, { error: e.message });
  }
};
