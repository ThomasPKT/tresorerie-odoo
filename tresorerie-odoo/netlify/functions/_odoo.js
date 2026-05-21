// netlify/functions/_odoo.js
// Shared Odoo XML-RPC helpers for all functions

const https = require('https');

const toXml = v => {
  if (v === null || v === false) return '<boolean>0</boolean>';
  if (typeof v === 'boolean') return `<boolean>${v ? 1 : 0}</boolean>`;
  if (typeof v === 'number' && Number.isInteger(v)) return `<int>${v}</int>`;
  if (typeof v === 'number') return `<double>${v}</double>`;
  if (typeof v === 'string') return `<string>${v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</string>`;
  if (Array.isArray(v)) return `<array><data>${v.map(i=>`<value>${toXml(i)}</value>`).join('')}</data></array>`;
  if (typeof v === 'object') {
    const m = Object.entries(v).map(([k,val])=>`<member><name>${k}</name><value>${toXml(val)}</value></member>`).join('');
    return `<struct>${m}</struct>`;
  }
  return `<string>${v}</string>`;
};

const parseXmlRpc = xml => {
  let pos = 0;
  const skipWs = () => { while (pos < xml.length && /\s/.test(xml[pos])) pos++; };

  const parseValue = () => {
    skipWs();
    if (!xml.slice(pos).startsWith('<value>') && !xml.slice(pos).startsWith('<value ')) return null;
    pos = xml.indexOf('>', pos) + 1;
    skipWs();
    let result;

    if (xml.slice(pos).startsWith('<int>') || xml.slice(pos).startsWith('<i4>') || xml.slice(pos).startsWith('<i8>')) {
      const tag = xml.slice(pos+1, xml.indexOf('>', pos));
      pos += tag.length + 2;
      const end = xml.indexOf(`</${tag}>`, pos);
      result = parseInt(xml.slice(pos, end), 10);
      pos = end + tag.length + 3;
    } else if (xml.slice(pos).startsWith('<double>')) {
      pos += 8; const end = xml.indexOf('</double>', pos); result = parseFloat(xml.slice(pos, end)); pos = end + 9;
    } else if (xml.slice(pos).startsWith('<boolean>')) {
      pos += 9; const end = xml.indexOf('</boolean>', pos); result = xml.slice(pos, end).trim() === '1'; pos = end + 10;
    } else if (xml.slice(pos).startsWith('<string>')) {
      pos += 8; const end = xml.indexOf('</string>', pos);
      result = xml.slice(pos, end).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"');
      pos = end + 9;
    } else if (xml.slice(pos).startsWith('<nil/>')) {
      pos += 6; result = null;
    } else if (xml.slice(pos).startsWith('<array>')) {
      pos += 7;
      const dataIdx = xml.indexOf('<data>', pos); pos = dataIdx + 6;
      result = [];
      skipWs();
      while (!xml.slice(pos).startsWith('</data>')) { result.push(parseValue()); skipWs(); }
      pos += 7; skipWs(); pos += 8;
    } else if (xml.slice(pos).startsWith('<struct>')) {
      pos += 8; result = {}; skipWs();
      while (!xml.slice(pos).startsWith('</struct>')) {
        pos += 8; skipWs();
        const nameStart = xml.indexOf('<name>', pos) + 6;
        const nameEnd = xml.indexOf('</name>', nameStart);
        const name = xml.slice(nameStart, nameEnd);
        pos = nameEnd + 7; skipWs();
        result[name] = parseValue();
        skipWs();
        if (xml.slice(pos).startsWith('</member>')) pos += 9;
        skipWs();
      }
      pos += 9;
    } else {
      const closeVal = xml.indexOf('</value>', pos);
      result = xml.slice(pos, closeVal).trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
      pos = closeVal;
    }
    skipWs();
    if (xml.slice(pos).startsWith('</value>')) pos += 8;
    return result;
  };

  if (xml.includes('<fault>')) {
    const fsIdx = xml.indexOf('<name>faultString</name>');
    if (fsIdx !== -1) {
      const strStart = xml.indexOf('<string>', fsIdx) + 8;
      const strEnd = xml.indexOf('</string>', strStart);
      throw new Error(xml.slice(strStart, strEnd).split('\n')[0].trim() || 'Erreur Odoo');
    }
    throw new Error('Erreur Odoo inconnue');
  }

  const paramsIdx = xml.indexOf('<params>');
  if (paramsIdx === -1) throw new Error('Réponse XML-RPC invalide');
  pos = xml.indexOf('<param>', paramsIdx) + 7;
  skipWs();
  return parseValue();
};

const xmlrpcCall = (host, endpoint, method, params) => new Promise((resolve, reject) => {
  const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params.map(p=>`<param><value>${toXml(p)}</value></param>`).join('')}</params></methodCall>`;
  const options = {
    hostname: host, port: 443, path: endpoint, method: 'POST',
    headers: { 'Content-Type': 'text/xml', 'Content-Length': Buffer.byteLength(body) }
  };
  const req = https.request(options, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try { resolve(parseXmlRpc(data)); }
      catch(e) { reject(e); }
    });
  });
  req.on('error', reject);
  req.write(body); req.end();
});

const delay = ms => new Promise(r => setTimeout(r, ms));

const odooSearch = async (host, db, uid, key, model, domain, fields, limit = 500) => {
  const results = await xmlrpcCall(host, '/xmlrpc/2/object', 'execute_kw', [
    db, uid, key, model, 'search_read', [domain],
    { fields, limit, order: 'id desc', context: {} }
  ]);
  const numFields = ['amount_residual', 'amount_untaxed', 'amount_total', 'amount', 'current_statement_balance'];
  const falseFields = ['invoice_date_due', 'date_order', 'commitment_date', 'date'];
  return (Array.isArray(results) ? results : []).map(r => {
    const out = { ...r };
    numFields.forEach(f => { if (f in out) out[f] = parseFloat(out[f]) || 0; });
    falseFields.forEach(f => { if (out[f] === false || out[f] === 0) out[f] = null; });
    return out;
  });
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const respond = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) });

module.exports = { xmlrpcCall, odooSearch, delay, respond, corsHeaders };
