import type {ArenaEvent} from '../shared/arenaProtocol';

const durations:Record<string,number>={zone:360,tap:280,cast:480,resolve:420,damage:480,life:600,phase:1100};
export type VisualCue={event:ArenaEvent;start:number;end:number;progress:number};

export class AnimationTimeline {
  private lastSequence=0;
  private cues:Omit<VisualCue,'progress'>[]=[];
  private reduced=false;
  constructor(sequence=0,private capacity=48){this.lastSequence=sequence;}
  push(events:ArenaEvent[],now:number){
    for(const event of events){
      if(!Number.isSafeInteger(event.sequence)||event.sequence<=this.lastSequence)continue;
      this.lastSequence=event.sequence;
      const duration=durations[event.kind];
      if(this.reduced||!duration||(event.kind==='phase'&&event.data.phase!=='UNTAP'))continue;
      if(event.kind==='zone'&&!((event.data.from==='Library'&&event.data.to==='Hand')||['Hand','Battlefield','Stack'].includes(event.data.from??'')))continue;
      this.cues.push({event:structuredClone(event),start:now,end:now+duration});
    }
    this.cues=this.cues.filter(cue=>cue.end>now).slice(-this.capacity);
  }
  frame(now:number):VisualCue[]{
    this.cues=this.cues.filter(cue=>cue.end>now);
    return this.cues.map(cue=>({...cue,progress:Math.max(0,Math.min(1,(now-cue.start)/(cue.end-cue.start)))}));
  }
  clear(){this.cues=[];}
  setReduced(value:boolean){this.reduced=value;if(value)this.clear();}
}
