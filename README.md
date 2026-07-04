# Lovky 💶

Appka na spoločné mesačné výdavky pre dvoch — zadávanie, automatická kategorizácia podľa obchodu, mesačné vyúčtovanie (kto komu koľko doplatí) a grafy.

Vanilla JS, bez build kroku. Grafy cez [Chart.js](https://www.chartjs.org/).

## Lokálne spustenie

```
npx http-server -p 8124 -c-1 .
```

a otvor `http://localhost:8124`.

## Dáta

Výdavky sa ukladajú do `localStorage`. Súkromné dáta (`data/seed.json`, pôvodný xlsx) nie sú súčasťou repa. Záloha: Nastavenia → Exportovať JSON.
