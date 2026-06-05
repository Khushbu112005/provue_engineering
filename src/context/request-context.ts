import { AsyncLocalStorage } from "async_hooks";

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface RequestContextStore {
  requestId: string;
  traceId: string;
  sessionId: string;
  question: string;
  toolsCalled: string[];
  tablesRead: Set<string>;
  tokenUsage: TokenUsage;
  agentPlan: any;
  startTime: number;
  responseLength: number;
  toolExecutionTime: number;
  databaseQueryTime: number;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => Promise<T>): Promise<T> {
    return storage.run(store, fn);
  },

  getStore(): RequestContextStore | undefined {
    return storage.getStore();
  },

  logTableRead(tableName: string) {
    const store = storage.getStore();
    if (store) {
      store.tablesRead.add(tableName);
    }
  },

  logToolCall(toolName: string) {
    const store = storage.getStore();
    if (store) {
      store.toolsCalled.push(toolName);
    }
  },

  addDatabaseQueryTime(ms: number) {
    const store = storage.getStore();
    if (store) {
      store.databaseQueryTime += ms;
    }
  },

  addToolExecutionTime(ms: number) {
    const store = storage.getStore();
    if (store) {
      store.toolExecutionTime += ms;
    }
  },

  setTokenUsage(prompt: number, completion: number, total: number) {
    const store = storage.getStore();
    if (store) {
      store.tokenUsage = { prompt, completion, total };
    }
  },

  setAgentPlan(plan: any) {
    const store = storage.getStore();
    if (store) {
      store.agentPlan = plan;
    }
  },

  setResponseLength(len: number) {
    const store = storage.getStore();
    if (store) {
      store.responseLength = len;
    }
  }
};
