import {createHostedApiProvider} from '../../src/api/hosted-api.js';
import {allowsRequest} from './permissions.js';

const provider = createHostedApiProvider();
export const dataSource = {
  ...provider,
  async request(options) {
    if (!allowsRequest(options)) {
      throw Object.assign(new Error('Your account cannot access this resource.'), {status:403});
    }
    if (globalThis.NORTHPOINT_CONFIG.READ_ONLY_PREVIEW && (options.method ?? 'GET') !== 'GET') {
      throw Object.assign(new Error('Development preview is read-only. No changes were saved.'), {status:403});
    }
    return provider.request(options);
  }
};
