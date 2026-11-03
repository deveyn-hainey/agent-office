// Dev helper (S1): fills every surface with sample content and frames a close-up. Not imported by the app.
export async function populate(office) {
  const S=office.world.surfaces; const U=(id,d)=>S.update(id,'set',d);
U('board-4f',{requests:[{who:'you',text:'Add a live odds ticker to the home screen, with a price-change flash'}],steps:[{n:1,text:'Spec the ticker data contract',done:true},{n:2,text:'Wire odds feed in AI layer'},{n:3,text:'Build ticker UI component'},{n:4,text:'Device QA on iOS + Android'}],cards:[{id:'a',title:'Odds feed adapter',owner:'codex',scope:'ai/odds',key:'KAN-143',status:'doing'},{id:'b',title:'Ticker component',owner:'cursor',scope:'ui/ticker',key:'KAN-144'},{id:'c',title:'Flash animation spec',owner:'musecode',scope:'design',key:'KAN-145',status:'done'}]});
U('vote-4f',{proposals:[{id:'D-14',text:'Ship the odds ticker behind a feature flag first',yes:3,no:1,locked:true,votes:{lead:'yes',codex:'yes',cursor:'yes',grok:'no'}},{id:'D-15',text:'Use websocket instead of polling',yes:2,no:0,votes:{lead:'yes',codex:'yes'}}]});
U('board-2f',{title:'Review findings',columns:[{title:'Reviewer A',owner:'reva',items:[{sev:'high',text:'Null deref in odds parser when feed is empty'},{sev:'med',text:'Missing retry on websocket drop'},{sev:'low',text:'Rename helper for clarity'}]},{title:'Reviewer B',owner:'revb',items:[{sev:'high',text:'Race in cache refresh'},{sev:'low',text:'Unused import in ticker'}]}]});
U('jira-2f',{cards:[{key:'KAN-143',title:'Odds feed adapter',col:'doing',owner:'codex'},{key:'KAN-144',title:'Ticker component',col:'todo',owner:'cursor'},{key:'KAN-145',title:'Flash animation spec',col:'done',owner:'musecode'},{key:'KAN-146',title:'Device QA pass on Android',col:'review',owner:'grok'},{key:'KAN-147',title:'Settings screen copy',col:'todo',owner:'muse'},{key:'KAN-148',title:'Fix crash on cold start',col:'doing',owner:'codex'},{key:'KAN-149',title:'Add analytics events',col:'todo',owner:'cursor'}]});
U('ci-2f',{badge:'local CI',status:'running',jobs:[{name:'lint',status:'pass'},{name:'unit-tests',status:'fail',note:'3 failing: odds.parse'},{name:'build-ios',status:'running',note:'xcodebuild'},{name:'build-android',status:'running'},{name:'e2e',status:'queued'},{name:'bundle-size',status:'warn',note:'+42kb'}]});
U('xray-2f',{nodes:[...'api,parser,cache,feed,ticker,home,theme,button,store,router,auth,odds,flash,utils'.split(',')].map((id,i)=>({id,label:id+'.ts',group:['core','core','core','ai','ui','ui','ui','ui','core','ui','core','ai','ui','core'][i]})),edges:[['api','parser'],['parser','cache'],['feed','odds'],['odds','ticker'],['ticker','flash'],['home','ticker'],['home','router'],['button','theme'],['store','cache'],['auth','api'],['feed','api'],['ticker','store']],highlight:['feed','odds','ticker']});
for(const m of [['lead','Morning team, ticker spec is locked.'],['codex','On it. Feed adapter in progress, should land by noon.'],['cursor','Ticker component scaffolded, waiting on the feed types.'],['grok','Will test on devices after merge.']]) office.bus.emit('slack:message',{channel:'pitchside-dev',who:m[0],text:m[1],ts:Date.now()-60000});
office.bus.emit('slack:message',{channel:'pitchside-dev',who:'You',text:'Great, ping me when CI is green',you:true,ts:Date.now()});
U('mural-1f',{badge:{text:'Pitchside FC',color:'#e25a4f'}});
U('screen-3f-a',{title:'Findings — Review agent A',agent:'reva',findings:[{sev:'high',text:'Null deref in odds parser when feed is empty',file:'src/odds/parse.ts:88'},{sev:'med',text:'Missing retry on websocket drop',file:'src/net/ws.ts:41'},{sev:'low',text:'Rename helper for clarity',file:'src/util/fmt.ts:7'}]});
U('screen-3f-b',{title:'Findings — Review agent B',agent:'revb',findings:[{sev:'high',text:'Race in cache refresh',file:'src/cache.ts:12'}]});
U('cork-3f',{notes:[{text:'Parser trusts feed length'},{text:'Cache never invalidated'},{text:'Retry missing on ws'},{text:'Same bug in v1?'},{text:'Ask Codex about timeouts'}],strings:[[0,1],[1,2],[0,3],[3,4]]});
return 'ok';
}
export function look(office, zoom, x, y, z) {
  office.world.setTimeOfDay(12);
  office.cam.zoomBy(zoom);
  office.cam.target.set(x, y, z);
}
