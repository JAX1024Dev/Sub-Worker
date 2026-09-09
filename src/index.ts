import { handleRequest } from './api/router';

export default {
  fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
