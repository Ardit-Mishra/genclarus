// The homepage is a server component whose only job is to load the worked example and hand it to
// the client island that owns the search box.
//
// Splitting it this way is what makes the example *server-rendered*: the sentences, their citations
// and the ClinVar rows are in the initial HTML, so they are there for a crawler, for a link preview,
// and for anyone whose JavaScript has not arrived yet. Rendered inside the client component instead,
// the page's first paint would still be an empty box under a search field -- which is the thing
// being fixed.

import Home from "./Home";
import { getWorkedExample } from "@/lib/corpus/worked-example";

export default async function Page() {
  const example = await getWorkedExample();
  return <Home example={example} />;
}
