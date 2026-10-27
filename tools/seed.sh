#!/bin/sh
# seed the local test server with sample wines and one passport
B=${1:-http://localhost:8788}
put() { curl -s -o /dev/null -X PUT -H 'X-PG: 1' -H 'Content-Type: application/json' "$B/api/admin/doc/$1" -d "$2"; }
put wines/chenin '{"name":"Old-vine Chenin Blanc","vintage":"2024","estate":3,"place":"Swartland","made":60,"placed":41}'
put wines/syrah  '{"name":"Syrah","vintage":"2023","estate":7,"place":"Swartland","made":36,"placed":30}'
put wines/chard  '{"name":"Chardonnay","vintage":"2024","estate":11,"place":"Hemel-en-Aarde Ridge","made":48,"placed":19}'
put wines/cab    '{"name":"Cabernet Sauvignon","vintage":"2022","estate":5,"place":"Stellenbosch","made":72,"placed":72}'
put passports/PG-26ABCD-01 '{"caseId":"PG-26ABCD-01","wine":"Syrah","vintage":"2023","estate":7,"region":"Swartland","soil":"granite","destination":"Antibes","packedAt":"2026-09-01","landedAt":"2026-09-20","releasedAt":"2026-09-22","handedAt":"2026-09-23","seal":"match","loggerMin":12,"loggerMax":17}'
