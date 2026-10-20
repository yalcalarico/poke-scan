import subprocess,json
from pathlib import Path
queries={
'catalogPriceCoverage':'''SELECT json_build_object('cards',(SELECT count(*) FROM cards),'pricedCards',(SELECT count(DISTINCT "cardId") FROM card_prices WHERE provider='tcgdex' AND source='tcgplayer' AND currency='USD' AND market IS NOT NULL),'pricedInLast24h',(SELECT count(DISTINCT "cardId") FROM card_prices WHERE provider='tcgdex' AND source='tcgplayer' AND currency='USD' AND market IS NOT NULL AND "fetchedAt">now()-interval '24 hours'),'latestFetchedAt',(SELECT max("fetchedAt") FROM card_prices WHERE provider='tcgdex' AND source='tcgplayer' AND currency='USD'));''',
'anniversarySets':'''SELECT coalesce(json_agg(row_to_json(q)),'[]') FROM (SELECT s.id,s.name,s."tcgdexSetId",s."releaseDate",(SELECT count(*) FROM cards c WHERE c."setId"=s.id) cards,(SELECT count(DISTINCT p."cardId") FROM card_prices p JOIN cards c ON c.id=p."cardId" WHERE c."setId"=s.id AND p.provider='tcgdex' AND p.source='tcgplayer' AND p.currency='USD' AND p.market IS NOT NULL) priced_cards FROM card_sets s WHERE s.id IN ('me55','30th') OR s.name ILIKE '%30th%' OR s.name ILIKE '%annivers%' ORDER BY s.id) q;''',
'anniversaryCardsSample':'''SELECT coalesce(json_agg(row_to_json(q)),'[]') FROM (SELECT id,name,number,"setId" FROM cards WHERE "setId"='me55' ORDER BY id LIMIT 5) q;''',
'queuedJobs':'''SELECT coalesce(json_agg(row_to_json(q)),'[]') FROM (SELECT status,count(*) count FROM price_refresh_jobs GROUP BY status ORDER BY status) q;''',
'ownedItemCoverageAggregate':'''SELECT json_build_object('storedItemGroups',count(*),'withMarket',count(*) FILTER(WHERE p.market IS NOT NULL),'withoutMarket',count(*) FILTER(WHERE p.market IS NULL)) FROM collection_items i LEFT JOIN LATERAL(SELECT market FROM card_prices WHERE "cardId"=i."cardId" AND variant=i.variant AND provider='tcgdex' AND source='tcgplayer' AND currency='USD' ORDER BY "fetchedAt" DESC LIMIT 1)p ON true;'''
}
result={}
for name,q in queries.items():
 r=subprocess.run(['docker','exec','-i','pokemon-scanner-db','psql','-U','pokemon','-d','pokemon_cards','-X','-A','-t','-v','ON_ERROR_STOP=1'],input='BEGIN READ ONLY;\n'+q+'\nROLLBACK;\n',capture_output=True,text=True)
 if r.returncode:raise RuntimeError(name+' failed; diagnostic withheld')
 lines=[x for x in r.stdout.splitlines() if x not in ('BEGIN','ROLLBACK') and x.strip()]
 result[name]=json.loads(lines[0])
Path('/private/tmp/pokescan-prices-research-20261013/local-price-diagnostic.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
