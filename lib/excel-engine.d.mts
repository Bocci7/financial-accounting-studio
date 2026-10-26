export type InputCell={sheet:string;address:string;value:number;label:string;min:number;max:number;decimals:number;enabled:boolean};
export type Analysis={candidates:InputCell[];answers:{sheet:string;address:string}[];sheets:{name:string;rows:number;columns:number}[];cachedVerified:number};
export type Generated={students:{name:string;bytes:Uint8Array}[];answerBytes:Uint8Array;zipBytes:Uint8Array;analysis:Analysis};
export function analyze(task:Uint8Array,solution:Uint8Array):Promise<Analysis>;
export function generate(task:Uint8Array,solution:Uint8Array,options:{count:number;seed:string;inputs:InputCell[]},progress?:(n:number,total:number)=>void):Promise<Generated>;
export function demoFiles():Promise<{taskBytes:Uint8Array;solutionBytes:Uint8Array}>;
