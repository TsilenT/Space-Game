export type Team = 'crew' | 'enemy'
export type Phase = 'player' | 'enemy'
export type Status = 'playing' | 'victory' | 'defeat'
export interface Point { x: number; y: number }
export interface Unit extends Point { id: string; name: string; role: string; team: Team; hp: number; maxHp: number; ap: number }
export interface GameState { units: Unit[]; phase: Phase; status: Status; turn: number; selectedId?: string; log: string[] }
export interface Cell extends Point { room: string; system?: string }

export const WIDTH = 12, HEIGHT = 8
const blocked = new Set(['0,0','0,1','0,6','0,7','11,0','11,1','11,6','11,7','4,0','7,0','4,7','7,7','4,3','7,4'])
export const key = ({ x, y }: Point) => `${x},${y}`
export const isWalkable = (p: Point) => p.x >= 0 && p.x < WIDTH && p.y >= 0 && p.y < HEIGHT && !blocked.has(key(p))
export const roomAt = (p: Point) => p.x < 4 ? 'Boarding Bay' : p.x < 8 ? (p.y < 4 ? 'Medbay' : 'Reactor') : (p.y < 4 ? 'Bridge' : 'Weapons')
export const systems: Cell[] = [{x:6,y:1,room:'Medbay',system:'MED'},{x:6,y:6,room:'Reactor',system:'CORE'},{x:10,y:1,room:'Bridge',system:'NAV'},{x:10,y:6,room:'Weapons',system:'GUN'}]
const crew = (id:string,name:string,role:string,x:number,y:number):Unit => ({id,name,role,x,y,team:'crew',hp:8,maxHp:8,ap:4})
const foe = (id:string,name:string,x:number,y:number):Unit => ({id,name,role:'Void raider',x,y,team:'enemy',hp:6,maxHp:6,ap:4})
export function createGame(): GameState { return { phase:'player', status:'playing', turn:1, selectedId:'ada', log:['Boarding clamps locked. Eliminate all hostiles.'], units:[crew('ada','Ada Voss','Marine',1,6),crew('milo','Milo Chen','Engineer',1,5),crew('imani','Imani Okafor','Medic',2,5),crew('soren','Soren Vale','Scout',2,6),foe('wraith-1','Wraith Kesh',6,2),foe('wraith-2','Wraith Oru',9,2),foe('wraith-3','Wraith Vek',9,6)] } }
const alive = (u:Unit) => u.hp > 0
const distance = (a:Point,b:Point) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
const occupied = (state:GameState,p:Point,ignore?:string) => state.units.some(u=>alive(u)&&u.id!==ignore&&u.x===p.x&&u.y===p.y)
const neighbors = (p:Point):Point[] => [{x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1}].filter(isWalkable)
export function selectUnit(state:GameState,id:string):GameState { const u=state.units.find(x=>x.id===id); return state.phase==='player'&&state.status==='playing'&&u?.team==='crew'&&alive(u)?{...state,selectedId:id}:state }
export function legalMoves(state:GameState):Point[] { const u=state.units.find(x=>x.id===state.selectedId); if(!u||state.phase!=='player'||!alive(u)) return []; const seen=new Map<string,number>([[key(u),0]]), queue:Point[]=[u], out:Point[]=[]; while(queue.length){const p=queue.shift()!,d=seen.get(key(p))!; if(d>=u.ap)continue; for(const n of neighbors(p)){if(seen.has(key(n))||occupied(state,n,u.id))continue;seen.set(key(n),d+1);queue.push(n);out.push(n)}} return out }
export function move(state:GameState,x:number,y:number):GameState { const u=state.units.find(v=>v.id===state.selectedId); const target={x,y}; if(!u||!legalMoves(state).some(p=>key(p)===key(target)))return state; const cost=shortestDistance(state,u,target,u.id); return {...state,units:state.units.map(v=>v.id===u.id?{...v,x,y,ap:v.ap-cost}:v),log:[`${u.name} moved into ${roomAt(target)}.`,...state.log].slice(0,5)} }
function shortestDistance(state:GameState,start:Point,end:Point,ignore?:string){const q:[Point,number][]=[[start,0]],seen=new Set([key(start)]);while(q.length){const[p,d]=q.shift()!;if(key(p)===key(end))return d;for(const n of neighbors(p)){if(!seen.has(key(n))&&!occupied(state,n,ignore)){seen.add(key(n));q.push([n,d+1])}}}return 99}
function outcome(state:GameState):GameState { const crewAlive=state.units.some(u=>u.team==='crew'&&alive(u)), enemyAlive=state.units.some(u=>u.team==='enemy'&&alive(u)); return {...state,status:!enemyAlive?'victory':!crewAlive?'defeat':'playing'} }
export function attack(state:GameState,targetId:string):GameState { const a=state.units.find(u=>u.id===state.selectedId),t=state.units.find(u=>u.id===targetId); if(state.phase!=='player'||state.status!=='playing'||!a||!t||!alive(a)||!alive(t)||a.team===t.team||a.ap<2||distance(a,t)>4)return state; return outcome({...state,units:state.units.map(u=>u.id===a.id?{...u,ap:u.ap-2}:u.id===t.id?{...u,hp:Math.max(0,u.hp-3)}:u),log:[`${a.name} fires on ${t.name}: 3 damage.`,...state.log].slice(0,5)}) }
export function endTurn(state:GameState):GameState { return state.phase==='player'&&state.status==='playing'?{...state,phase:'enemy',selectedId:undefined,units:state.units.map(u=>u.team==='enemy'?{...u,ap:4}:u),log:['Enemy activity detected…',...state.log].slice(0,5)}:state }
export function enemyTurn(input:GameState):GameState { if(input.phase!=='enemy')return input; let state=outcome(input); if(state.status!=='playing')return state; for(const enemy of state.units.filter(u=>u.team==='enemy'&&alive(u)).sort((a,b)=>a.id.localeCompare(b.id))){ let current=state.units.find(u=>u.id===enemy.id)!; const targets=state.units.filter(u=>u.team==='crew'&&alive(u)).sort((a,b)=>distance(current,a)-distance(current,b)||a.id.localeCompare(b.id)); const target=targets[0]; if(!target)break; if(distance(current,target)<=4){state={...state,units:state.units.map(u=>u.id===target.id?{...u,hp:Math.max(0,u.hp-2)}:u),log:[`${current.name} strikes ${target.name}: 2 damage.`,...state.log].slice(0,5)}} else {const options=neighbors(current).filter(p=>!occupied(state,p,current.id)).sort((a,b)=>distance(a,target)-distance(b,target)||a.y-b.y||a.x-b.x);if(options[0])state={...state,units:state.units.map(u=>u.id===current.id?{...u,...options[0]}:u),log:[`${current.name} advances.`,...state.log].slice(0,5)}} state=outcome(state);if(state.status!=='playing')return state }
 return {...state,phase:'player',turn:state.turn+1,selectedId:state.units.find(u=>u.team==='crew'&&alive(u))?.id,units:state.units.map(u=>u.team==='crew'&&alive(u)?{...u,ap:4}:u)} }
