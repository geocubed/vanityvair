// Noon UTC keeps a date-only selection on the same calendar day in Vancouver.
export function parsePostDate(value: unknown): string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Choose a valid post date.');
 const date=new Date(`${value}T12:00:00.000Z`);
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('Choose a valid post date.');
 return date.toISOString();
}
export function postDateInput(value?:string|null):string {
 if(!value)return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Vancouver',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 return ['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-');
}
