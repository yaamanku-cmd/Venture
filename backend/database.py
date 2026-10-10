import os
import time
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    Float,
    String,
    Boolean,
    Text,
    desc,
    func,
)
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///fraud_shield.db")

# SQLite connection args for concurrent multi-threaded FastAPI access
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    pool_pre_ping=True,
)

# Enable WAL (Write-Ahead Logging) mode for SQLite to maximize concurrent read/write throughput
if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))
Base = declarative_base()

class TransactionRecord(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    timestamp = Column(Float, nullable=False, default=time.time, index=True)
    time_val = Column(Float, nullable=False)
    amount = Column(Float, nullable=False)
    fraud_probability = Column(Float, nullable=False, index=True)
    verdict = Column(String(20), nullable=False, index=True)
    ground_truth = Column(String(20), nullable=True)
    is_reviewed = Column(Boolean, default=False, nullable=False)
    analyst_notes = Column(Text, nullable=True)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "time": self.time_val,
            "amount": self.amount,
            "fraud_probability": round(self.fraud_probability, 6),
            "verdict": self.verdict,
            "ground_truth": self.ground_truth,
            "is_reviewed": self.is_reviewed,
            "analyst_notes": self.analyst_notes,
        }

def init_db():
    Base.metadata.create_all(bind=engine)
    print(f"[Database] SQLite database initialized at '{DATABASE_URL}' (WAL mode active).")

def save_transaction(
    time_val: float,
    amount: float,
    fraud_probability: float,
    verdict: str,
    ground_truth: Optional[str] = None,
    timestamp: Optional[float] = None,
) -> TransactionRecord:
    session = SessionLocal()
    try:
        record = TransactionRecord(
            timestamp=timestamp or time.time(),
            time_val=float(time_val),
            amount=round(float(amount), 2),
            fraud_probability=float(fraud_probability),
            verdict=str(verdict),
            ground_truth=ground_truth,
            is_reviewed=False,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        return record
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()

def get_db_stats() -> Dict[str, Any]:
    session = SessionLocal()
    try:
        total = session.query(func.count(TransactionRecord.id)).scalar() or 0
        fraud = (
            session.query(func.count(TransactionRecord.id))
            .filter(TransactionRecord.verdict == "Fraud")
            .scalar()
            or 0
        )
        legit = total - fraud
        rate = round((fraud / total * 100), 2) if total > 0 else 0.0
        return {
            "total": total,
            "fraud": fraud,
            "legit": legit,
            "fraud_rate": rate,
        }
    finally:
        session.close()

def get_recent_transactions(limit: int = 40, verdict_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    session = SessionLocal()
    try:
        query = session.query(TransactionRecord)
        if verdict_filter and verdict_filter != "all":
            query = query.filter(TransactionRecord.verdict == verdict_filter)
        records = query.order_by(desc(TransactionRecord.id)).limit(limit).all()
        return [r.to_dict() for r in records]
    finally:
        session.close()

def mark_reviewed(transaction_id: int, notes: Optional[str] = None) -> Optional[Dict[str, Any]]:
    session = SessionLocal()
    try:
        record = session.query(TransactionRecord).filter(TransactionRecord.id == transaction_id).first()
        if not record:
            return None
        record.is_reviewed = True
        if notes:
            record.analyst_notes = notes
        session.commit()
        session.refresh(record)
        return record.to_dict()
    finally:
        session.close()
