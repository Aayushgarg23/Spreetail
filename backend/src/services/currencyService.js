const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = process.env.EXCHANGE_API_BASE || 'https://api.frankfurter.app';

/**
 * Fetch or retrieve cached historical exchange rate.
 * Policy: use the rate as of the expense_date, never today's rate.
 * This ensures balances remain consistent regardless of when they are calculated.
 *
 * @param {Date|string} date - The date of the transaction
 * @param {string} fromCurrency - Source currency code (e.g. "USD")
 * @param {string} toCurrency - Target currency code (e.g. "INR")
 * @returns {Promise<{ rate: number, source: 'cache'|'api' }>}
 */
async function getRate(date, fromCurrency, toCurrency) {
  // Normalize currencies to uppercase
  fromCurrency = fromCurrency.toUpperCase();
  toCurrency = toCurrency.toUpperCase();

  // If same currency, rate is 1
  if (fromCurrency === toCurrency) return { rate: 1, source: 'identity' };

  // Normalize date to YYYY-MM-DD string
  const dateStr = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const dateObj = new Date(dateStr);

  // 1. Check cache first
  const cached = await prisma.exchangeRateCache.findUnique({
    where: {
      date_fromCurrency_toCurrency: {
        date: dateObj,
        fromCurrency,
        toCurrency,
      },
    },
  });

  if (cached) {
    return { rate: Number(cached.rate), source: 'cache' };
  }

  // 2. Fetch from API
  const url = `${BASE_URL}/${dateStr}?from=${fromCurrency}&to=${toCurrency}`;
  let rate;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Frankfurter API returned ${response.status} for ${url}`);
    }
    const data = await response.json();
    rate = data.rates[toCurrency];
    if (!rate) throw new Error(`Rate for ${toCurrency} not found in response`);
  } catch (err) {
    // If the date is a weekend/holiday, frankfurter returns the previous business day's rate.
    // If API is down, throw so the caller can handle it.
    throw new Error(`Currency conversion failed: ${err.message}`);
  }

  // 3. Cache the result
  await prisma.exchangeRateCache.create({
    data: {
      date: dateObj,
      fromCurrency,
      toCurrency,
      rate,
    },
  }).catch(() => {
    // Ignore unique constraint errors (race condition on parallel requests)
  });

  return { rate, source: 'api' };
}

/**
 * Convert an amount from one currency to INR.
 * Returns { amountInr, rate, source }.
 *
 * @param {number} amount - Original amount in fromCurrency
 * @param {string} fromCurrency - "USD" | "INR" etc.
 * @param {Date|string} date - Transaction date for historical rate lookup
 */
async function convertToInr(amount, fromCurrency, date) {
  if (fromCurrency.toUpperCase() === 'INR') {
    return { amountInr: amount, rate: 1, source: 'identity' };
  }

  const { rate, source } = await getRate(date, fromCurrency, 'INR');
  const amountInr = parseFloat((amount * rate).toFixed(2));
  return { amountInr, rate, source };
}

module.exports = { getRate, convertToInr };
