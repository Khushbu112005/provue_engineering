# Data Dictionary

This document describes the schema structure, column types, constraints, and relationships for the Tara Finance Research Agent's database.

---

## 1. Table: `funds`
Stores mutual fund metadata.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `text` | Primary Key, Not Null | Unique identifier for the fund (e.g. `fund_bluechip`). |
| `name` | `text` | Not Null | User-friendly name of the fund (e.g. `Saffron Bluechip Equity Fund`). |
| `category` | `text` | Not Null | Classification of the fund (e.g. `large_cap`, `debt`, `commodity`). |

---

## 2. Table: `fund_navs`
Stores the historic Net Asset Value (NAV) history for funds.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `serial` | Primary Key, Not Null | Auto-incrementing identifier. |
| `fund_id` | `text` | Foreign Key (references `funds.id`), Not Null | Reference to the corresponding fund. |
| `nav_date` | `date` | Not Null | Date of the NAV recording (formatted as `YYYY-MM-DD`). |
| `nav_value`| `double precision` | Not Null | Net Asset Value of the fund on the recorded date. |

---

## 3. Table: `holdings`
Stores user-owned investments (shares or units purchased).

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `serial` | Primary Key, Not Null | Auto-incrementing identifier. |
| `fund_id` | `text` | Foreign Key (references `funds.id`), Not Null | Reference to the fund owned. |
| `units` | `double precision` | Not Null | Decimal number of units owned. |
| `purchase_date`| `date` | Not Null | Date when units were purchased. |
| `purchase_nav` | `double precision` | Not Null | NAV of the fund at the time of purchase. |

---

## 4. Table: `transactions`
Stores personal banking and credit card transaction histories.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `text` | Primary Key, Not Null | Unique transaction ID (e.g. `txn_00001`). |
| `date` | `date` | Not Null | Transaction date. |
| `merchant` | `text` | Not Null | Raw, original merchant string (e.g. `SWIGGY BANGALORE`). |
| `normalized_merchant`| `text` | Not Null | Uppercased, special-character-free version of raw merchant name. |
| `merchant_family` | `text` | Not Null | Normalized merchant with location suffixes and prefixes removed. |
| `canonical_merchant`| `text` | Not Null | Clustered canonical merchant representing the brand (e.g. `SWIGGY`). |
| `category` | `text` | Not Null | User-assigned or inferred spending category (e.g. `food`, `transfer`). |
| `amount` | `double precision` | Not Null | Cost in local currency. Negative values represent refunds. |
| `currency` | `text` | Not Null | Currency code (e.g. `INR`). |
| `memo` | `text` | Not Null | Raw bank memo text (e.g. UPI details). |
