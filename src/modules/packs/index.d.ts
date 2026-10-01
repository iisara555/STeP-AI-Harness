export function installPack(workspace:string,source:string,options?:{name?:string}):any;
export function listPacks(workspace:string,policy?:any):any[];
export function enablePack(workspace:string,id:string,policy:any,options?:any):any;
export function packAsset(workspace:string,id:string,assetId:string,kind:string,policy:any):{text:string;label:string;digest:string};
export function enabledPackHooks(workspace:string,policy:any):any[];
export function exportPack(workspace:string,id:string,destination:string,options?:any):any;
