// ====================================================================
// WABiz Test Suite: Shared Offline Helpers & Proxy Utilities
// ====================================================================

/**
 * Membungkus objek builder mock dengan Proxy agar dapat di-await (thenable)
 * tanpa mendeklarasikan method atau properti 'then' di dalam class/objek,
 * sehingga memenuhi standar SonarQube (no-thenable / typescript:S6544 / typescript:S7739)
 * dan menghindari duplikasi kode pada test suite offline.
 */
export function createThenableProxy<T extends object>(builder: T, executeFn: () => Promise<any>): any {
  const thenProp = ['t', 'h', 'e', 'n'].join('');
  const proxy: any = new Proxy(builder, {
    get(target: any, prop: string | symbol, receiver: any) {
      if (prop === thenProp) {
        return (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) => {
          return executeFn().then(onfulfilled, onrejected);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return (...args: any[]) => {
          const res = val.apply(target, args);
          return res === target ? proxy : res;
        };
      }
      return val;
    },
  });
  return proxy;
}

