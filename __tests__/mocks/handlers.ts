import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('https://api.exchangerate-api.com/v4/latest/USD', () =>
    HttpResponse.json({ rates: { USD: 1, EUR: 0.92, JPY: 151.12 } }),
  ),
];
