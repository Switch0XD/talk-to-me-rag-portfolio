import { ChatWidget } from "@/components/chat-widget";
import { profile } from "@/content/profile";

export default function Home() {
  return (
    <main>
      <section className="hero section" id="top">
        <div className="hero-copy">
          <p className="eyebrow">{profile.availability}</p>
          <h1>
            Building useful systems <em>with care.</em>
          </h1>
          <p className="lede">{profile.intro}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#work">Explore my work</a>
            <a className="button button-quiet" href={`mailto:${profile.email}`}>Get in touch</a>
          </div>
        </div>
        <aside className="hero-card" aria-label="Profile summary">
          <p className="eyebrow">{profile.title}</p>
          <p className="name">{profile.name}</p>
          <p>{profile.location}</p>
          <div className="rule" />
          <p className="card-copy">Ask the assistant what the portfolio evidence says—not what it guesses.</p>
        </aside>
      </section>

      <section className="section split-section" id="about" aria-labelledby="about-title">
        <p className="section-label">01 / About</p>
        <div>
          <h2 id="about-title">A practical full stack engineer with a systems mindset.</h2>
          {profile.about.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <div className="social-links" aria-label="Contact links">
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            {profile.social.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer">{link.label} ↗</a>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="work" aria-labelledby="work-title">
        <p className="section-label">02 / Selected work</p>
        <h2 id="work-title">Projects shaped by real operational constraints.</h2>
        <div className="project-grid">
          {profile.projects.map((project, index) => (
            <article className="project-card" key={project.name}>
              <div className="project-number">0{index + 1}</div>
              <p className="eyebrow">{project.eyebrow}</p>
              <h3>{project.name}</h3>
              <p>{project.summary}</p>
              <ul>
                {project.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
              </ul>
              <div className="tags" aria-label={`${project.name} technologies`}>
                {project.stack.map((item) => <span key={item}>{item}</span>)}
              </div>
              {project.href ? (
                <a className="text-link" href={project.href} target="_blank" rel="noreferrer">
                  {project.linkLabel || "View project"} ↗
                </a>
              ) : (
                <p className="private-note">A public project link is not included in the supplied source material.</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="section closing" id="contact" aria-labelledby="contact-title">
        <p className="section-label">03 / Contact</p>
        <h2 id="contact-title">Let’s build something reliable.</h2>
        <p>For opportunities and collaboration, write to <a href={`mailto:${profile.email}`}>{profile.email}</a>.</p>
      </section>

      <footer>
        <span>© {new Date().getFullYear()} {profile.name}</span>
        <a href="#top">Back to top ↑</a>
      </footer>
      <ChatWidget firstName={profile.firstName} />
    </main>
  );
}
