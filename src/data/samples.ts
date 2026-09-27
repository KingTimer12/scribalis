import { DAY, HOUR } from "../lib/constants";
import { uid } from "../lib/format";
import type { Book, Chapter, Status } from "../lib/types";

export function chap(title: string, status: Status, body: string, notes = ""): Chapter {
  return { id: uid(), title, status, body, notes };
}

export function emptyChap(): Chapter {
  return chap("", "rascunho", "");
}

export function sampleBooks(): Book[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      title: "A Torre das Mil Luas",
      cover: null,
      cur: 2,
      updatedAt: now - 2 * HOUR,
      chapters: [
        chap(
          "O sino que não tocava",
          "pronto",
          "Na cidade de Vael, todo mundo sabia que o sino da torre norte não tocava havia cem anos.\n\nPor isso, quando ele soou à meia-noite — uma única vez, grave e longa —, Ilen Marr foi a única pessoa da rua que não saiu de casa para olhar. Ela já estava de pé, com a lanterna acesa e a bolsa de ferramentas no ombro, como se tivesse esperado por aquele som a vida inteira.\n\n— Então é hoje — murmurou, e apagou a vela da mesa.",
          "Revelar quem tocou o sino só no capítulo 5.\n\nIlen já sabia do sino — plantar a pista da bolsa de ferramentas.",
        ),
        chap(
          "A aprendiz de cartógrafo",
          "revisao",
          "O mapa de Ilen tinha um erro, e o erro estava se mexendo.\n\nDurante três semanas ela tinha marcado com tinta vermelha a mesma viela atrás do mercado de sal. Toda manhã, a viela estava dois passos mais perto da torre.\n\nMestre Odran dizia que mapas não mentem. Ilen começava a desconfiar que mapas apenas escolhem a quem contar a verdade.",
        ),
        chap(
          "Mapas que mentem",
          "rascunho",
          "A torre norte não tinha porta. Tinha, no lugar dela, uma parede lisa onde alguém havia desenhado a giz o contorno de uma.",
          "Odran aparece no fim? Decidir.",
        ),
      ],
    },
    {
      id: uid(),
      title: "Herdeira das Cinzas",
      cover: null,
      cur: 1,
      updatedAt: now - DAY - 3 * HOUR,
      chapters: [
        chap(
          "A coroação que não houve",
          "revisao",
          "A coroa chegou ao salão numa caixa de madeira comum, carregada por um menino de recados que não sabia o que levava.\n\nQuando Saera abriu a tampa, encontrou apenas cinza — fina, morna, ainda cheirando a fumaça.",
        ),
        chap("Sal e ferro", "rascunho", "O conselho levou três dias para decidir que a culpa era dela."),
      ],
    },
    {
      id: uid(),
      title: "Crônicas do Quinto Andar",
      cover: null,
      cur: 0,
      updatedAt: now - 6 * DAY,
      chapters: [
        chap(
          "O vizinho do 502",
          "rascunho",
          "O vizinho do 502 recebia cartas endereçadas a pessoas que ainda não tinham nascido.",
        ),
      ],
    },
  ];
}
