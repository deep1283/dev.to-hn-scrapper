import Image from "next/image"

const useCases = [
  {
    badge: "For startup founders",
    title: "Startups",
    description:
      "Get notified the moment someone drops your name on Hacker News, Dev.to, or GitHub Discussions. Respond fast and turn organic mentions into customers.",
    image: "/images/usecase-indie.jpg",
    imageAlt: "A startup founder checking brand mention notifications",
    reverse: false,
  },
  {
    badge: "For marketing teams",
    title: "Marketing teams",
    description:
      "Track campaign reach across communities. See where your product is discussed, analyze momentum, and measure share-of-voice against competitors.",
    image: "/images/usecase-business.jpg",
    imageAlt: "A marketing manager analyzing brand data on screen",
    reverse: true,
  },
  {
    badge: "For developer advocates",
    title: "DevRel & community",
    description:
      "Stay on top of technical discussions, support requests, and product feedback across Hacker News, Dev.to, and GitHub Discussions.",
    image: "/images/usecase-team.jpg",
    imageAlt: "A team reviewing community data on a large display",
    reverse: false,
  },
]

export function UseCases() {
  return (
    <section id="use-cases" className="px-6 py-20 md:py-32">
      <div className="mx-auto max-w-6xl">
        <p className="text-center font-handwriting text-lg text-primary">
          Use cases
        </p>
        <h2 className="mx-auto mt-3 max-w-lg text-center font-serif text-4xl leading-tight text-foreground md:text-5xl text-balance">
          Tracking that works for your world
        </h2>

        <div className="mt-20 flex flex-col gap-24">
          {useCases.map((useCase) => (
            <div
              key={useCase.title}
              className="grid items-center gap-10 md:grid-cols-2"
            >
              <div
                className={
                  useCase.reverse ? "order-2 md:order-1" : "order-2"
                }
              >
                <span className="font-handwriting inline-block text-base text-primary">
                  {useCase.badge}
                </span>
                <h3 className="mt-3 font-serif text-3xl text-foreground md:text-4xl">
                  {useCase.title}
                </h3>
                <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
                  {useCase.description}
                </p>
              </div>
              <div
                className={
                  useCase.reverse ? "order-1 md:order-2" : "order-1"
                }
              >
                <Image
                  src={useCase.image}
                  alt={useCase.imageAlt}
                  width={520}
                  height={400}
                  className="rounded-2xl object-cover shadow-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
