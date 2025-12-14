import json

def calculate_trade_fee(amount, rate=0.003):
    return amount * rate

def calculate_withdrawal_fee(amount, rate=0.001):
    return amount * rate

def calculate_storage_fee(amount, rate=0.0005):
    return amount * rate

def summarize_fees(trade_amount, withdrawal_amount, storage_amount):
    trade_fee = calculate_trade_fee(trade_amount)
    withdrawal_fee = calculate_withdrawal_fee(withdrawal_amount)
    storage_fee = calculate_storage_fee(storage_amount)
    total_fee = trade_fee + withdrawal_fee + storage_fee
    summary = {
        "trade_fee": trade_fee,
        "withdrawal_fee": withdrawal_fee,
        "storage_fee": storage_fee,
        "total_fee": total_fee
    }
    return json.dumps(summary, indent=2)

if __name__ == "__main__":
    # Example usage
    trade = 1000.0
    withdrawal = 500.0
    storage = 200.0
    print(summarize_fees(trade, withdrawal, storage))