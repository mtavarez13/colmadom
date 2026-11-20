import { CircleDollarSign, Instagram, ReceiptText } from "lucide-react";
import styles from "./login-ambient.module.css";

const fallingSymbols = [
  { kind: "fiscal", left: "3%", delay: "-3s", duration: "10s" },
  { kind: "money", left: "12%", delay: "-8s", duration: "11s" },
  { kind: "instagram", left: "23%", delay: "-5s", duration: "9s" },
  { kind: "money", left: "77%", delay: "-7s", duration: "10s" },
  { kind: "fiscal", left: "87%", delay: "-4s", duration: "12s" },
  { kind: "instagram", left: "95%", delay: "-1s", duration: "9s" },
] as const;

export function LoginAmbient() {
  return <>
    <div className={styles.ambient} aria-hidden="true">
      {fallingSymbols.map((symbol, index) => <span
        key={index}
        className={`${styles.particle} ${styles[symbol.kind]}`}
        style={{ left: symbol.left, animationDelay: symbol.delay, animationDuration: symbol.duration }}
      >
        {symbol.kind === "fiscal" ? <><ReceiptText size={21}/><b>DGII</b></> : symbol.kind === "money" ? <CircleDollarSign size={31}/> : <Instagram size={30}/>}
      </span>)}
    </div>
    <div className={styles.badges}>
      <span className={`${styles.badge} ${styles.badgeFiscal}`} title="Facturación electrónica e-CF"><ReceiptText size={15}/> e-CF · DGII</span>
      <span className={`${styles.badge} ${styles.badgeMoney}`} title="Control de ventas"><CircleDollarSign size={16}/> RD$</span>
      <a className={`${styles.badge} ${styles.badgeInstagram}`} href="https://www.instagram.com/inmartagosrl/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de @inmartagosrl"><Instagram size={15}/> @inmartagosrl</a>
    </div>
  </>;
}
