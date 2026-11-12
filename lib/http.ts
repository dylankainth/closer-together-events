import { NextResponse } from "next/server";
export const ok = (data: unknown) => NextResponse.json(data);
export const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
