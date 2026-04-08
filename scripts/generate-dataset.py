"""Synthetic orders dataset generator.

Run: python scripts/generate-dataset.py

Writes ~10k rows to data/orders.csv with timestamps skewed toward recent
so "last 30 hours", "last week", and "last 60 days" queries all have meaningful
answers. Seeded for reproducibility.
"""

import csv
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

N_ROWS = 10_000
END = datetime(2026, 4, 7, 18, 0, 0)  # fixed endpoint — pinned NOW() rewrite targets this
START = END - timedelta(days=90)

STATUSES = [
    ("delivered", 0.70),
    ("shipped", 0.15),
    ("canceled", 0.10),
    ("processing", 0.05),
]
STATES = ["CA", "NY", "TX", "FL", "WA", "IL", "OR", "MA", "CO", "AZ"]
PAYMENTS = [
    ("credit_card", 0.60),
    ("debit_card", 0.25),
    ("boleto", 0.10),
    ("voucher", 0.05),
]


def weighted(choices):
    roll = random.random()
    cum = 0.0
    for value, weight in choices:
        cum += weight
        if roll <= cum:
            return value
    return choices[-1][0]


def skewed_timestamp():
    # 30% of orders in last 7 days, 60% in last 60 days, rest older.
    r = random.random()
    if r < 0.30:
        delta = timedelta(days=7 * random.random())
    elif r < 0.90:
        delta = timedelta(days=7 + 53 * random.random())
    else:
        delta = timedelta(days=60 + 30 * random.random())
    return END - delta


def main():
    rows = []
    for _ in range(N_ROWS):
        ts = skewed_timestamp()
        price = round(random.lognormvariate(3.5, 0.8), 2)
        price = min(max(price, 5.0), 500.0)
        freight = round(price * random.uniform(0.05, 0.20), 2)
        rows.append(
            {
                "order_id": str(uuid.uuid4()),
                "customer_id": random.randint(1, 2000),
                "order_purchase_timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "order_status": weighted(STATUSES),
                "price": price,
                "freight_value": freight,
                "customer_state": random.choice(STATES),
                "payment_type": weighted(PAYMENTS),
            }
        )

    rows.sort(key=lambda r: r["order_purchase_timestamp"])

    out = Path("data/orders.csv")
    out.parent.mkdir(exist_ok=True)
    with out.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {out}")
    print(f"Timestamp range: {rows[0]['order_purchase_timestamp']} -> {rows[-1]['order_purchase_timestamp']}")

    # Quick sanity: how many rows fall in last 30h, last 7d, last 60d
    def count_recent(hours):
        cutoff = END - timedelta(hours=hours)
        return sum(1 for r in rows if datetime.strptime(r["order_purchase_timestamp"], "%Y-%m-%d %H:%M:%S") >= cutoff)

    print(f"Last 30 hours:  {count_recent(30)} rows")
    print(f"Last 7 days:    {count_recent(24 * 7)} rows")
    print(f"Last 60 days:   {count_recent(24 * 60)} rows")


if __name__ == "__main__":
    main()
