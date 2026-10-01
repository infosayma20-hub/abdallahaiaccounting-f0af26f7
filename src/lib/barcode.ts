/** توحيد قراءة الباركود: أرقام عربية/فارسية → لاتينية، حذف المسافات ومحارف التحكم (لاحقات أجهزة المسح). */
export function normalizeBarcode(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06f0))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** طابور تسلسلي: كل مسحة تنتظر اللي قبلها بدل ما تنرمى أثناء انشغال الطلب السابق. */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
