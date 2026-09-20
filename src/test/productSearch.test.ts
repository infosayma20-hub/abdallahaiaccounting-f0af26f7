import { describe, it, expect } from "vitest";
import { scoreSearchMatch, toSearchTokens } from "@/lib/productSearch";
const m=(n:string,q:string)=>scoreSearchMatch(n,[],toSearchTokens(q),q)>=0;
describe("productSearch",()=>{
 it("word anywhere",()=>expect(m("كوكا كولا 1.5 لتر","كولا")).toBe(true));
 it("out of order",()=>expect(m("كوكا كولا 1.5 لتر","لتر كوكا")).toBe(true));
 it("3 letters",()=>expect(m("بروست دجاج","برو")).toBe(true));
 it("hamza/ta marbuta",()=>expect(m("أجبان ماعز طازة","اجبان طازه")).toBe(true));
 it("no match",()=>expect(m("بروست دجاج","بيتزا")).toBe(false));
 it("arabic digits",()=>expect(m("كولا 1.5","١.٥")).toBe(true));
});
