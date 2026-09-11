# Priority API call example — ORDERS with `$since`

Victor's reference for the shape of an incremental ORDERS pull: change detection via `$since`, a trimmed `$select`, line items inlined through `$expand` with a nested `$select`, and `$top`/`$skip` pagination. Preserved from the original `API call example.docx` (March 2026); see the `priority-erp-api` skill for the rules behind each clause.

```
{{baseurl}}ORDERS?$since=2026-03-18T00:00:00Z
  &$select=CUSTNAME,CDES,CURDATE,ORDNAME,ORDSTATUSDES,STATUSDATE,AGENTCODE,QPRICE
  &$expand=ORDERITEMS_SUBFORM($select=KLINE,PARTNAME,PDES,TQUANT,PRICE)
  &$top=5&$skip=10
```
