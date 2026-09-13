import type {ArenaEvent} from './arenaProtocol';

export function appendStackEvent(history:ArenaEvent[],event:ArenaEvent):ArenaEvent[]{
  if(!['cast','resolve'].includes(event.kind)||history.some(item=>item.sequence>=event.sequence))return history;
  return [...history.slice(-15),event];
}
