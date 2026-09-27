import { useSheets } from '../lib/sheets';
import { AccountSheet, DeleteSheet, InstallSheet } from './AccountSheets';
import { HistorySheet } from './HistorySheet';
import { ImportSheet } from './ImportSheet';
import { ItemSheet } from './ItemSheet';
import { ObligationSheet } from './ObligationSheet';
import { PaidSheet } from './PaidSheet';
import { PayeeSheet } from './PayeeSheet';
import { PaySheet } from './PaySheet';
import { SearchSheet } from './SearchSheet';

export function SheetHost({ signedIn }: { signedIn: boolean }) {
  const sheets = useSheets();
  const open = sheets.filter((s) => !s.closing);
  const top = open[open.length - 1]?.id;
  return (
    <>
      {sheets.map((s, depth) => {
        const common = { depth, isTop: s.id === top };
        if (!signedIn && s.kind !== 'account' && s.kind !== 'install') return null;
        switch (s.kind) {
          case 'add':
          case 'edit':
            return <ObligationSheet key={s.id} spec={s} {...common} />;
          case 'item':
            return <ItemSheet key={s.id} spec={s} {...common} />;
          case 'pay':
            return <PaySheet key={s.id} spec={s} {...common} />;
          case 'paid':
            return <PaidSheet key={s.id} spec={s} {...common} />;
          case 'payee':
            return <PayeeSheet key={s.id} spec={s} {...common} />;
          case 'search':
            return <SearchSheet key={s.id} spec={s} {...common} />;
          case 'history':
            return <HistorySheet key={s.id} spec={s} {...common} />;
          case 'import':
            return <ImportSheet key={s.id} spec={s} {...common} />;
          case 'account':
            return <AccountSheet key={s.id} spec={s} {...common} />;
          case 'delete':
            return <DeleteSheet key={s.id} spec={s} {...common} />;
          case 'install':
            return <InstallSheet key={s.id} spec={s} {...common} />;
        }
      })}
    </>
  );
}
